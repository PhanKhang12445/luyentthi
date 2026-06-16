import React, { useEffect, useState } from 'react';
import apiClient from '../services/api';
import './ExamReview.css';

function ExamReview({ examData, onSaved }) {
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchExam = async () => {
      try {
        const response = await apiClient.get(`/exams/${examData.examId}`);
        setQuestions(response.data.questions);

        const initialAnswers = {};
        response.data.questions.forEach((question) => {
          if (question.correctOptionId) {
            initialAnswers[question.id] = question.correctOptionId;
          }
        });
        setAnswers(initialAnswers);
      } catch (err) {
        setError('Failed to load extracted questions');
      } finally {
        setLoading(false);
      }
    };

    fetchExam();
  }, [examData]);

  const handleAnswer = (questionId, optionId) => {
    setAnswers((current) => ({
      ...current,
      [questionId]: optionId,
    }));
  };

  const handleSave = async () => {
    if (Object.keys(answers).length !== questions.length) {
      setError('Please select the correct answer for every question.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await apiClient.put(`/exams/${examData.examId}/answers`, { answers });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save answer key');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="review-card">Loading extracted questions...</div>;
  }

  return (
    <div className="review-card">
      <div className="review-header">
        <h2>Check Answer Key</h2>
        <p>{examData.title}</p>
      </div>

      {error && <div className="review-error">{error}</div>}

      <div className="review-list">
        {questions.map((question, index) => {
          const diagramSrc = question.diagramImageUrl
            ? `http://localhost:5000${question.diagramImageUrl}`
            : question.diagramSvg
            ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(question.diagramSvg)}`
            : null;

          return (
            <section key={question.id} className="review-question">
              <h3>{question.questionNumber || index + 1}. {question.text}</h3>
              {diagramSrc && (
                <div className="review-diagram">
                  <img src={diagramSrc} alt="" />
                </div>
              )}
              <div className="review-options">
                {question.options.map((option) => (
                  <label key={option.id} className="review-option">
                    <input
                      type="radio"
                      name={`answer-${question.id}`}
                      checked={answers[question.id] === option.id}
                      onChange={() => handleAnswer(question.id, option.id)}
                    />
                    <span>{option.option_text}</span>
                  </label>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <button className="review-save" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving...' : 'Save Answer Key'}
      </button>
    </div>
  );
}

export default ExamReview;
