require('dotenv').config();

const pool = require('../config/database');

const run = async () => {
  await pool.query('ALTER TABLE question ADD COLUMN IF NOT EXISTS diagram_image_path TEXT');

  const latestExam = await pool.query('SELECT id FROM exam ORDER BY created_at DESC LIMIT 1');

  if (latestExam.rows.length === 0) {
    console.log('No exams found');
    await pool.end();
    return;
  }

  const examId = latestExam.rows[0].id;
  const images = {
    2: '/uploads/question-diagrams/1781586474845-Image (8)-ink-diagram-q2.png',
    7: '/uploads/question-diagrams/1781586474845-Image (8)-ink-diagram-q7.png',
  };

  for (const [questionNumber, imagePath] of Object.entries(images)) {
    await pool.query(
      'UPDATE question SET diagram_image_path = $1 WHERE exam_id = $2 AND question_number = $3',
      [imagePath, examId, Number(questionNumber)]
    );
  }

  const result = await pool.query(
    'SELECT question_number, diagram_image_path FROM question WHERE exam_id = $1 AND diagram_image_path IS NOT NULL ORDER BY question_number',
    [examId]
  );

  console.log(JSON.stringify(result.rows, null, 2));
  await pool.end();
};

run().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => {});
  process.exit(1);
});
