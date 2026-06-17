const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
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
  await pool.query('ALTER TABLE exam ADD COLUMN IF NOT EXISTS pass_score INTEGER DEFAULT 80');
  await pool.query('UPDATE exam SET pass_score = 80 WHERE pass_score IS NULL');
  await pool.query('ALTER TABLE question ADD COLUMN IF NOT EXISTS question_number INTEGER');
  await pool.query('ALTER TABLE question ADD COLUMN IF NOT EXISTS image_path TEXT');
  await pool.query('ALTER TABLE question ADD COLUMN IF NOT EXISTS source_image_path TEXT');
  await pool.query('ALTER TABLE question ADD COLUMN IF NOT EXISTS diagram_image_path TEXT');
  await pool.query('ALTER TABLE question ADD COLUMN IF NOT EXISTS diagram_svg TEXT');
  await pool.query('ALTER TABLE exam_history ADD COLUMN IF NOT EXISTS details JSONB');
};

const toQuestionNumber = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
    const shouldRequireAiExtraction = Boolean(process.env.GEMINI_API_KEY);

    try {
      const geminiQuestions = await extractExamWithGemini(fileResult.path, file.mimetype);

      if (geminiQuestions && geminiQuestions.length > 0) {
        questions = geminiQuestions;
        usedGemini = true;
      }
    } catch (geminiError) {
      console.warn('Gemini extraction failed:', geminiError.message);

      if (shouldRequireAiExtraction) {
        throw new Error('AI extraction is temporarily unavailable. Please try uploading again in a moment.');
      }
    }

    if (!usedGemini && shouldRequireAiExtraction) {
      throw new Error('AI could not extract valid questions from this image. Please retry or use a clearer image.');
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
    sourceImagePath: imagePath ? `/uploads/${path.basename(imagePath)}` : null,
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
      const questionNumber = String(toQuestionNumber(originalNumber, totalQuestions));
      const sourceIndex = String(questionIndex + 1);

      questions.push({
        ...question,
        question_number: questionNumber,
        source_index: sourceIndex,
        original_question_number: originalNumber,
        source_image_path: extractedFile.sourceImagePath,
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

  questions.sort((a, b) => (
    toQuestionNumber(a.question_number, Number.MAX_SAFE_INTEGER) -
    toQuestionNumber(b.question_number, Number.MAX_SAFE_INTEGER)
  ));

  if (questions.length === 0) {
    throw new Error('No valid questions found in selected file(s)');
  }

  const examId = uuidv4();
  const now = new Date();

  await ensureQuestionColumns();

  await pool.query(
    'INSERT INTO exam (id, title, created_by, status, pass_score, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [examId, title, userId, 'draft', 80, now]
  );

  for (const q of questions) {
    const questionId = uuidv4();
    await pool.query(
      'INSERT INTO question (id, exam_id, question_number, question_text, source_image_path, image_path, diagram_image_path, diagram_svg) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [
        questionId,
        examId,
        Number.parseInt(q.question_number, 10) || null,
        q.question_text,
        q.source_image_path || null,
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
      `SELECT e.id, e.title, e.created_by, e.status, e.pass_score, e.created_at, COUNT(q.id)::int AS question_count
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

const deleteExam = async (req, res) => {
  const { examId } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM exam WHERE id = $1 AND created_by = $2 RETURNING id',
      [examId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    res.json({ deleted: true, examId });
  } catch (error) {
    console.error('Error deleting exam:', error);
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
      'SELECT id, pass_score FROM exam WHERE id = $1 AND created_by = $2',
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

const updateExamPassScore = async (req, res) => {
  const { examId } = req.params;
  const passScore = Number.parseInt(req.body?.passScore, 10);

  if (!Number.isFinite(passScore) || passScore < 1 || passScore > 100) {
    return res.status(400).json({ error: 'Pass score must be between 1 and 100' });
  }

  try {
    await ensureQuestionColumns();

    const result = await pool.query(
      'UPDATE exam SET pass_score = $1 WHERE id = $2 AND created_by = $3 RETURNING id, pass_score',
      [passScore, examId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    res.json({ examId, passScore: result.rows[0].pass_score });
  } catch (error) {
    console.error('Error updating pass score:', error);
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
        sourceImageUrl: q.source_image_path,
        options: optionsResult.rows,
        correctOptionId: optionsResult.rows.find((option) => option.is_correct)?.id || null,
      });
    }
    
    res.json({
      exam: {
        id: exam.id,
        title: exam.title,
        createdBy: exam.created_by,
        passScore: exam.pass_score || 80,
        createdAt: exam.created_at
      },
      questions
    });
  } catch (error) {
    console.error('Error retrieving exam:', error);
    res.status(500).json({ error: error.message });
  }
};

const listExamHistory = async (req, res) => {
  const { examId } = req.params;

  try {
    const examResult = await pool.query(
      'SELECT id FROM exam WHERE id = $1 AND created_by = $2',
      [examId, req.user.id]
    );

    if (examResult.rows.length === 0) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    await ensureQuestionColumns();

    const result = await pool.query(
      `SELECT id, score, final_grade, details, submitted_at
       FROM exam_history
       WHERE exam_id = $1
       ORDER BY submitted_at DESC`,
      [examId]
    );

    res.json({ history: result.rows });
  } catch (error) {
    console.error('Error listing exam history:', error);
    res.status(500).json({ error: error.message });
  }
};

const deleteExamHistory = async (req, res) => {
  const { examId, historyId } = req.params;

  try {
    const examResult = await pool.query(
      'SELECT id FROM exam WHERE id = $1 AND created_by = $2',
      [examId, req.user.id]
    );

    if (examResult.rows.length === 0) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    await ensureQuestionColumns();

    if (historyId) {
      const result = await pool.query(
        'DELETE FROM exam_history WHERE id = $1 AND exam_id = $2 RETURNING id',
        [historyId, examId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Exam history not found' });
      }

      return res.json({ deleted: true, historyId });
    }

    const result = await pool.query(
      'DELETE FROM exam_history WHERE exam_id = $1 RETURNING id',
      [examId]
    );

    res.json({ deleted: true, deletedCount: result.rowCount });
  } catch (error) {
    console.error('Error deleting exam history:', error);
    res.status(500).json({ error: error.message });
  }
};

const resolveUploadPath = (uploadUrl) => {
  if (!uploadUrl || !uploadUrl.startsWith('/uploads/')) {
    return null;
  }

  return path.join(__dirname, '..', uploadUrl.replace('/uploads/', 'uploads/'));
};

const cropQuestionDiagram = async (req, res) => {
  const { examId, questionId } = req.params;
  const crop = req.body?.crop || {};
  const left = Math.round(Number(crop.left));
  const top = Math.round(Number(crop.top));
  const width = Math.round(Number(crop.width));
  const height = Math.round(Number(crop.height));

  if (![left, top, width, height].every(Number.isFinite) || width < 20 || height < 20) {
    return res.status(400).json({ error: 'A valid crop region is required' });
  }

  try {
    await ensureQuestionColumns();

    const result = await pool.query(
      `SELECT q.id, q.question_number, q.source_image_path
       FROM question q
       JOIN exam e ON e.id = q.exam_id
       WHERE q.id = $1 AND q.exam_id = $2 AND e.created_by = $3`,
      [questionId, examId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const question = result.rows[0];
    const sourcePath = resolveUploadPath(question.source_image_path);

    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return res.status(400).json({ error: 'Original image is not available for this question' });
    }

    const metadata = await sharp(sourcePath).metadata();
    const imageWidth = metadata.width;
    const imageHeight = metadata.height;

    if (!imageWidth || !imageHeight) {
      return res.status(400).json({ error: 'Original image cannot be read' });
    }

    const safeLeft = Math.min(Math.max(left, 0), imageWidth - 1);
    const safeTop = Math.min(Math.max(top, 0), imageHeight - 1);
    const safeWidth = Math.min(Math.max(width, 1), imageWidth - safeLeft);
    const safeHeight = Math.min(Math.max(height, 1), imageHeight - safeTop);
    const outputDir = path.join(path.dirname(sourcePath), 'question-diagrams');
    fs.mkdirSync(outputDir, { recursive: true });

    const prefix = path.basename(sourcePath, path.extname(sourcePath));
    const filename = `${prefix}-manual-q${question.question_number}-${Date.now()}.png`;
    const outputPath = path.join(outputDir, filename);

    await sharp(sourcePath)
      .extract({ left: safeLeft, top: safeTop, width: safeWidth, height: safeHeight })
      .png()
      .toFile(outputPath);

    const imageUrl = `/uploads/question-diagrams/${filename}`;
    await pool.query('UPDATE question SET diagram_image_path = $1, diagram_svg = NULL WHERE id = $2', [
      imageUrl,
      questionId,
    ]);

    res.json({ diagramImageUrl: imageUrl });
  } catch (error) {
    console.error('Error cropping diagram:', error);
    res.status(500).json({ error: error.message });
  }
};

const removeQuestionDiagram = async (req, res) => {
  const { examId, questionId } = req.params;

  try {
    await ensureQuestionColumns();

    const result = await pool.query(
      `UPDATE question q
       SET diagram_image_path = NULL, diagram_svg = NULL
       FROM exam e
       WHERE q.exam_id = e.id
         AND q.id = $1
         AND q.exam_id = $2
         AND e.created_by = $3
       RETURNING q.id`,
      [questionId, examId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    res.json({ diagramImageUrl: null });
  } catch (error) {
    console.error('Error removing diagram:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Submit exam answers and grade
 */
const submitExam = async (req, res) => {
  const { examId, answers } = req.body;
  const requestedPassScore = Number.parseInt(req.body?.passScore, 10);
  
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

    await ensureQuestionColumns();

    const submittedAnswers = new Map(
      answers.map((answer) => [answer.questionId, answer.selectedOptionId])
    );
    const questionIds = answers.map((answer) => answer.questionId);
    const questionsResult = await pool.query(
      `SELECT
         q.id,
         q.question_number,
         q.question_text,
         q.diagram_image_path,
         q.diagram_svg,
         ao.id AS option_id,
         ao.option_text,
         ao.is_correct
       FROM question q
       JOIN answer_option ao ON ao.question_id = q.id
       WHERE q.exam_id = $1 AND q.id = ANY($2::uuid[])
       ORDER BY q.question_number NULLS LAST, q.created_at, q.id, ao.created_at, ao.id`,
      [examId, questionIds]
    );

    const questionMap = new Map();

    for (const row of questionsResult.rows) {
      if (!questionMap.has(row.id)) {
        questionMap.set(row.id, {
          questionId: row.id,
          questionNumber: row.question_number,
          questionText: row.question_text,
          diagramImageUrl: row.diagram_image_path,
          diagramSvg: row.diagram_svg,
          selectedOptionId: submittedAnswers.get(row.id) || null,
          selectedOptionText: null,
          correctOptionId: null,
          correctOptionText: null,
          isCorrect: false,
          options: [],
        });
      }

      const detail = questionMap.get(row.id);
      detail.options.push({
        id: row.option_id,
        text: row.option_text,
        isCorrect: row.is_correct,
      });

      if (row.option_id === detail.selectedOptionId) {
        detail.selectedOptionText = row.option_text;
      }

      if (row.is_correct) {
        detail.correctOptionId = row.option_id;
        detail.correctOptionText = row.option_text;
      }
    }

    const results = answers
      .map((answer) => questionMap.get(answer.questionId))
      .filter(Boolean)
      .map((detail) => ({
        ...detail,
        isCorrect: detail.selectedOptionId === detail.correctOptionId,
      }));

    const correctCount = results.filter((result) => result.isCorrect).length;
    const totalQuestions = results.length;
    const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    const passScore = Number.isFinite(requestedPassScore) && requestedPassScore >= 1 && requestedPassScore <= 100
      ? requestedPassScore
      : examResult.rows[0].pass_score || 80;
    const grade = score >= passScore ? 'PASS' : 'FAIL';

    if (passScore !== examResult.rows[0].pass_score) {
      await pool.query(
        'UPDATE exam SET pass_score = $1 WHERE id = $2 AND created_by = $3',
        [passScore, examId, req.user.id]
      );
    }
    
    // Save exam history
    const historyId = uuidv4();
    const now = new Date();
    
    await pool.query(
      'INSERT INTO exam_history (id, exam_id, score, final_grade, details, submitted_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [historyId, examId, score, grade, JSON.stringify(results), now]
    );
    
    res.json({
      historyId,
      score,
      correctCount,
      totalQuestions,
      passScore,
      grade,
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
  cropQuestionDiagram,
  deleteExam,
  deleteExamHistory,
  removeQuestionDiagram,
  listExams,
  listExamHistory,
  getExam,
  updateAnswerKey,
  updateExamPassScore,
  submitExam,
};
