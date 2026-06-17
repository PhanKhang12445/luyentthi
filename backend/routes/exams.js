const express = require('express');
const multer = require('multer');
const path = require('path');
const {
  createExamFromFile,
  createExamsFromFiles,
  cropQuestionDiagram,
  deleteExam,
  getExam,
  listExamHistory,
  listExams,
  removeQuestionDiagram,
  submitExam,
  updateAnswerKey,
  updateExamPassScore,
} = require('../controllers/examController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'application/pdf',
    'text/plain',
    'image/jpeg',
    'image/jpg',
    'image/png',
  ];
  const allowedExts = ['.pdf', '.txt', '.jpg', '.jpeg', '.png'];
  const extension = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) || allowedExts.includes(extension)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Routes
router.use(requireAuth);
router.post('/create', upload.single('file'), createExamFromFile);
router.post('/create-batch', upload.array('files', 10), createExamsFromFiles);
router.get('/', listExams);
router.post('/:examId/questions/:questionId/diagram-crop', cropQuestionDiagram);
router.delete('/:examId/questions/:questionId/diagram', removeQuestionDiagram);
router.get('/:examId/history', listExamHistory);
router.get('/:examId', getExam);
router.put('/:examId/answers', updateAnswerKey);
router.put('/:examId/pass-score', updateExamPassScore);
router.delete('/:examId', deleteExam);
router.post('/submit', submitExam);

module.exports = router;
