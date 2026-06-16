import React, { useState, useEffect } from 'react';
import apiClient from '../services/api';
import './ExamTaker.css';

function ExamTaker({ examData, timeLimitMinutes = 30, onSubmit }) {
  const [questions, setQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState(timeLimitMinutes * 60);

  useEffect(() => {
    const fetchExam = async () => {
      try {
        const response = await apiClient.get(`/exams/${examData.examId}`);
        setQuestions(response.data.questions);
        setLoading(false);
      } catch (err) {
        setError('Failed to load exam questions');
        setLoading(false);
      }
    };

    fetchExam();
  }, [examData]);

  useEffect(() => {
    setRemainingSeconds(timeLimitMinutes * 60);
  }, [timeLimitMinutes, examData]);

  const handleAnswer = (questionId, optionId) => {
    setAnswers({
      ...answers,
      [questionId]: optionId,
    });
  };

  const handleNext = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  const handleSubmit = async () => {
    const answerArray = Object.entries(answers).map(([questionId, optionId]) => ({
      questionId,
      selectedOptionId: optionId,
    }));

    try {
      const response = await apiClient.post('/exams/submit', {
        examId: examData.examId,
        answers: answerArray,
      });
      onSubmit(response.data);
    } catch (err) {
      setError('Failed to submit exam');
    }
  };

  useEffect(() => {
    if (loading || error || questions.length === 0) return undefined;

    if (remainingSeconds <= 0) {
      handleSubmit();
      return undefined;
    }

    const timer = setTimeout(() => {
      setRemainingSeconds((seconds) => seconds - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [remainingSeconds, loading, error, questions.length]);

  if (loading) {
    return <div className="loading">Loading exam...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  if (questions.length === 0) {
    return <div className="error">No questions found</div>;
  }

  const question = questions[currentQuestion];
  const isAnswered = answers[question.id] !== undefined;
  const progress = ((currentQuestion + 1) / questions.length) * 100;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = String(remainingSeconds % 60).padStart(2, '0');
  const diagramSrc = question.diagramImageUrl
    ? `http://localhost:5000${question.diagramImageUrl}`
    : question.diagramSvg
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(question.diagramSvg)}`
    : null;

  return (
    <div className="exam-taker-container">
      <div className="exam-card">
        <div className="exam-header">
          <h2>{examData.title}</h2>
          <span className="question-counter">
            Question {question.questionNumber || currentQuestion + 1} of {questions.length}
          </span>
          <span className="timer-badge">
            {minutes}:{seconds}
          </span>
        </div>

        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }}></div>
        </div>

        <div className="question-content">
          <h3>{question.text}</h3>
          {diagramSrc && (
            <div className="diagram-panel">
              <img src={diagramSrc} alt="" />
            </div>
          )}

          <div className="options">
            {question.options.map((option) => (
              <label key={option.id} className="option-label">
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  value={option.id}
                  checked={answers[question.id] === option.id}
                  onChange={() => handleAnswer(question.id, option.id)}
                />
                <span className={`option-text ${isAnswered ? 'answered' : ''}`}>
                  {option.option_text}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="navigation">
          <button
            onClick={handlePrevious}
            disabled={currentQuestion === 0}
            className="nav-btn"
          >
            ← Previous
          </button>

          <div className="nav-spacer"></div>

          {currentQuestion === questions.length - 1 ? (
            <button
              onClick={handleSubmit}
              disabled={Object.keys(answers).length === 0}
              className="submit-btn"
            >
              Submit Exam
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="nav-btn"
            >
              Next →
            </button>
          )}
        </div>

        <div className="answered-summary">
          <p>Answered: {Object.keys(answers).length} / {questions.length}</p>
        </div>
      </div>
    </div>
  );
}

export default ExamTaker;
