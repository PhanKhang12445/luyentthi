const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');
const { parseExamText, validateQuestion } = require('../utils/parser');
const { extractTextFromImage } = require('../utils/ocr');
const { processFile } = require('../utils/fileHandler');
const { extractExamWithGemini } = require('../utils/gemini');
const {
  createDiagramImages,
} = require('../utils/diagramCrop');

const ensureQuestionColumns = async () => {
  await pool.query("ALTER TABLE exam ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft'");
  await pool.query('ALTER TABLE question ADD COLUMN IF NOT EXISTS question_number INTEGER');
  await pool.query('ALTER TABLE question ADD COLUMN IF NOT EXISTS image_path TEXT');
  await pool.query('ALTER TABLE question ADD COLUMN IF NOT EXISTS diagram_image_path TEXT');
  await pool.query('ALTER TABLE question ADD COLUMN IF NOT EXISTS diagram_svg TEXT');
};

/**
 * Create exam from one uploaded file
 */
const extractQuestionsFromFile = async (file) => {
  let extractedText;
  let questionImages = {};
  let diagramImages = {};
  let questions = [];
  let usedGemini = false;
  let imagePath = null;

  const fileResult = await processFile(file.path, file.mimetype);

  if (fileResult.isImage) {
    imagePath = fileResult.path;

    try {
      const geminiQuestions = await extractExamWithGemini(fileResult.path, file.mimetype);

      if (geminiQuestions && geminiQuestions.length > 0) {
        questions = geminiQuestions;
        usedGemini = true;
      }
    } catch (geminiError) {
      console.warn('Gemini extraction failed, falling back to OCR:', geminiError.message);
    }

    if (!usedGemini) {
      const ocrResult = await extractTextFromImage(fileResult.path);
      extractedText = ocrResult.text;
      questionImages = ocrResult.questionImages || {};
    }
  } else {
    extractedText = fileResult;
  }

  if (questions.length === 0) {
    questions = parseExamText(extractedText);
  }

  if (imagePath && usedGemini) {
    diagramImages = await createDiagramImages(imagePath, questions);
  }

  return {
    questions,
    questionImages,
    diagramImages,
    source: usedGemini ? 'gemini' : 'ocr',
  };
};

const createExamRecord = async ({ title, userId, extractedFiles }) => {
  const questions = [];
  const questionImages = {};
  const diagramImages = {};
  const sources = new Set();
  let totalQuestions = 0;

  for (const extractedFile of extractedFiles) {
    sources.add(extractedFile.source);

    extractedFile.questions.forEach((question, questionIndex) => {
      totalQuestions += 1;
      const originalNumber = String(question.question_number || questionIndex + 1);
      const questionNumber = String(totalQuestions);
      const sourceIndex = String(questionIndex + 1);

      questions.push({
        ...question,
        question_number: questionNumber,
        source_index: sourceIndex,
        original_question_number: originalNumber,
      });

      if (extractedFile.questionImages[originalNumber]) {
        questionImages[questionNumber] = extractedFile.questionImages[originalNumber];
      }

      if (extractedFile.diagramImages[originalNumber]) {
        diagramImages[questionNumber] = extractedFile.diagramImages[originalNumber];
      } else if (extractedFile.diagramImages[sourceIndex]) {
        diagramImages[questionNumber] = extractedFile.diagramImages[sourceIndex];
      }
    });
  }

  if (questions.length === 0) {
    throw new Error('No valid questions found in selected file(s)');
  }

  const examId = uuidv4();
  const now = new Date();

  await ensureQuestionColumns();

  await pool.query(
    'INSERT INTO exam (id, title, created_by, status, created_at) VALUES ($1, $2, $3, $4, $5)',
    [examId, title, userId, 'draft', now]
  );

  for (const q of questions) {
    const questionId = uuidv4();
    await pool.query(
      'INSERT INTO question (id, exam_id, question_number, question_text, image_path, diagram_image_path, diagram_svg) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [
        questionId,
        examId,
        Number.parseInt(q.question_number, 10) || null,
        q.question_text,
        questionImages[q.question_number] || null,
        diagramImages[q.question_number] || null,
        q.diagram_svg || null,
      ]
    );

    for (const option of q.options) {
      const optionId = uuidv4();
      const isCorrect = option.letter === q.correct_answer;

      await pool.query(
        'INSERT INTO answer_option (id, question_id, option_text, is_correct) VALUES ($1, $2, $3, $4)',
        [optionId, questionId, option.text, isCorrect]
      );
    }
  }

  return {
    examId,
    title,
    questionCount: questions.length,
    status: 'draft',
    source: Array.from(sources).join(','),
  };
};

const createExamRecordFromFile = async ({ file, title, userId }) => {
  const extracted = await extractQuestionsFromFile(file);

  return createExamRecord({
    title,
    userId,
    extractedFiles: [extracted],
  });
};

const createExamFromFile = async (req, res) => {
  const { title } = req.body;
  const file = req.file;

  if (!file || !title) {
    return res.status(400).json({ error: 'File and title are required' });
  }

  try {
    const exam = await createExamRecordFromFile({
      file,
      title,
      userId: req.user.id,
    });

    res.status(201).json({ ...exam, message: 'Exam created successfully' });
  } catch (error) {
    console.error('Error creating exam:', error);
    res.status(500).json({ error: error.message });
  }
};

const createExamsFromFiles = async (req, res) => {
  const { title } = req.body;
  const files = req.files || [];

  if (files.length === 0) {
    return res.status(400).json({ error: 'At least one file is required' });
  }

  try {
    const extractedFiles = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      extractedFiles.push(await extractQuestionsFromFile(file));
    }

    const fallbackTitle = files[0].originalname.replace(/\.[^.]+$/, '');
    const exam = await createExamRecord({
      title: title || fallbackTitle,
      userId: req.user.id,
      extractedFiles,
    });

    res.status(201).json({
      ...exam,
      fileCount: files.length,
      message: 'Exam created successfully',
    });
  } catch (error) {
    console.error('Error creating exams:', error);
    res.status(500).json({ error: error.message });
  }
};

const listExams = async (req, res) => {
  try {
    await ensureQuestionColumns();

    const result = await pool.query(
      `SELECT e.id, e.title, e.created_by, e.status, e.created_at, COUNT(q.id)::int AS question_count
       FROM exam e
       LEFT JOIN question q ON q.exam_id = e.id
       WHERE e.created_by = $1
       GROUP BY e.id
       ORDER BY e.created_at DESC`,
      [req.user.id]
    );

    res.json({ exams: result.rows });
  } catch (error) {
    console.error('Error listing exams:', error);
    res.status(500).json({ error: error.message });
  }
};

const updateAnswerKey = async (req, res) => {
  const { examId } = req.params;
  const { answers } = req.body;

  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ error: 'Answers are required' });
  }

  try {
    await ensureQuestionColumns();

    const examResult = await pool.query(
      'SELECT id FROM exam WHERE id = $1 AND created_by = $2',
      [examId, req.user.id]
    );

    if (examResult.rows.length === 0) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    for (const [questionId, selectedOptionId] of Object.entries(answers)) {
      await pool.query(
        'UPDATE answer_option SET is_correct = (id = $1) WHERE question_id = $2',
        [selectedOptionId, questionId]
      );
    }

    await pool.query('UPDATE exam SET status = $1 WHERE id = $2', ['ready', examId]);

    res.json({ examId, status: 'ready', message: 'Answer key saved' });
  } catch (error) {
    console.error('Error updating answer key:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get exam with questions and options
 */
const getExam = async (req, res) => {
  const { examId } = req.params;
  
  try {
    const examResult = await pool.query(
      'SELECT * FROM exam WHERE id = $1 AND created_by = $2',
      [examId, req.user.id]
    );
    
    if (examResult.rows.length === 0) {
      return res.status(404).json({ error: 'Exam not found' });
    }
    
    const exam = examResult.rows[0];
    
    const questionsResult = await pool.query(
      'SELECT * FROM question WHERE exam_id = $1 ORDER BY question_number NULLS LAST, created_at, id',
      [examId]
    );
    
    const questions = [];
    for (const q of questionsResult.rows) {
      const optionsResult = await pool.query(
        `SELECT id, option_text, is_correct
         FROM answer_option
         WHERE question_id = $1
         ORDER BY
           CASE
             WHEN option_text = 'Đúng' THEN 1
             WHEN option_text = 'Sai' THEN 2
             ELSE 3
           END,
           created_at,
           id`,
        [q.id]
      );
      
      questions.push({
        id: q.id,
        questionNumber: q.question_number,
        text: q.question_text,
        diagramImageUrl: q.diagram_image_path,
        diagramSvg: q.diagram_svg,
        imageUrl: q.image_path,
        options: optionsResult.rows,
        correctOptionId: optionsResult.rows.find((option) => option.is_correct)?.id || null,
      });
    }
    
    res.json({
      exam: {
        id: exam.id,
        title: exam.title,
        createdBy: exam.created_by,
        createdAt: exam.created_at
      },
      questions
    });
  } catch (error) {
    console.error('Error retrieving exam:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Submit exam answers and grade
 */
const submitExam = async (req, res) => {
  const { examId, answers } = req.body;
  
  if (!examId || !answers) {
    return res.status(400).json({ error: 'Exam ID and answers are required' });
  }
  
  try {
    const examResult = await pool.query(
      'SELECT id FROM exam WHERE id = $1 AND created_by = $2',
      [examId, req.user.id]
    );

    if (examResult.rows.length === 0) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    let correctCount = 0;
    const results = [];
    
    for (const answer of answers) {
      const { questionId, selectedOptionId } = answer;
      
      // Check if selected option is correct
      const optionResult = await pool.query(
        'SELECT is_correct FROM answer_option WHERE id = $1',
        [selectedOptionId]
      );
      
      if (optionResult.rows.length === 0) {
        continue;
      }
      
      const isCorrect = optionResult.rows[0].is_correct;
      if (isCorrect) correctCount++;
      
      results.push({
        questionId,
        selectedOptionId,
        isCorrect
      });
    }
    
    const totalQuestions = answers.length;
    const score = Math.round((correctCount / totalQuestions) * 100);
    
    // Save exam history
    const historyId = uuidv4();
    const now = new Date();
    
    await pool.query(
      'INSERT INTO exam_history (id, exam_id, score, final_grade, submitted_at) VALUES ($1, $2, $3, $4, $5)',
      [historyId, examId, score, score >= 70 ? 'PASS' : 'FAIL', now]
    );
    
    res.json({
      historyId,
      score,
      correctCount,
      totalQuestions,
      grade: score >= 70 ? 'PASS' : 'FAIL',
      results
    });
  } catch (error) {
    console.error('Error submitting exam:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createExamFromFile,
  createExamsFromFiles,
  listExams,
  getExam,
  updateAnswerKey,
  submitExam,
};
