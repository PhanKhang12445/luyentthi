import React, { useEffect, useState } from 'react';
import apiClient from '../services/api';
import './ExamLibrary.css';

function ExamLibrary({ onUpload, onReview, onStart }) {
  const [exams, setExams] = useState([]);
  const [timeByExam, setTimeByExam] = useState({});
  const [passScoreByExam, setPassScoreByExam] = useState({});
  const [historyByExam, setHistoryByExam] = useState({});
  const [expandedHistory, setExpandedHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchExams = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/exams');
      setExams(response.data.exams);
      setPassScoreByExam(Object.fromEntries(
        response.data.exams.map((exam) => [exam.id, String(exam.pass_score || 80)])
      ));
    } catch (err) {
      setError('Failed to load exam list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExams();
  }, []);

  const handleDelete = async (exam) => {
    const confirmed = window.confirm(`Delete "${exam.title}"?`);

    if (!confirmed) return;

    try {
      await apiClient.delete(`/exams/${exam.id}`);
      setExams((current) => current.filter((item) => item.id !== exam.id));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete exam');
    }
  };

  const handleDeleteHistoryAttempt = async (exam, attemptId) => {
    const confirmed = window.confirm('Delete this exam attempt history?');

    if (!confirmed) return;

    try {
      await apiClient.delete(`/exams/${exam.id}/history/${attemptId}`);
      setHistoryByExam((current) => ({
        ...current,
        [exam.id]: (current[exam.id] || []).filter((attempt) => attempt.id !== attemptId),
      }));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete exam history');
    }
  };

  const handleClearHistory = async (exam) => {
    const confirmed = window.confirm(`Delete all history for "${exam.title}"?`);

    if (!confirmed) return;

    try {
      await apiClient.delete(`/exams/${exam.id}/history`);
      setHistoryByExam((current) => ({
        ...current,
        [exam.id]: [],
      }));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to clear exam history');
    }
  };

  const getExamMinutes = (examId) => {
    const value = Number(timeByExam[examId]);

    return Number.isFinite(value) && value > 0 ? value : 30;
  };

  const toggleHistory = async (exam) => {
    if (expandedHistory === exam.id) {
      setExpandedHistory(null);
      return;
    }

    setExpandedHistory(exam.id);

    if (historyByExam[exam.id]) return;

    try {
      const response = await apiClient.get(`/exams/${exam.id}/history`);
      setHistoryByExam((current) => ({
        ...current,
        [exam.id]: response.data.history,
      }));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load exam history');
    }
  };

  const handlePassScoreChange = async (exam, value) => {
    setPassScoreByExam((current) => ({
      ...current,
      [exam.id]: value,
    }));

    const passScore = Number(value);
    if (!Number.isFinite(passScore) || passScore < 1 || passScore > 100) return;

    try {
      await apiClient.put(`/exams/${exam.id}/pass-score`, { passScore });
      setExams((current) => current.map((item) => (
        item.id === exam.id ? { ...item, pass_score: passScore } : item
      )));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update pass score');
    }
  };

  if (loading) {
    return <div className="library-card">Loading exams...</div>;
  }

  return (
    <div className="library-card">
      <div className="library-header">
        <div>
          <h2>My Exams</h2>
          <p>Personal exam library</p>
        </div>
        <button onClick={onUpload}>Upload File</button>
      </div>

      {error && <div className="library-error">{error}</div>}

      {exams.length === 0 ? (
        <div className="empty-state">No exams yet.</div>
      ) : (
        <div className="exam-list">
          {exams.map((exam) => {
            const history = historyByExam[exam.id] || [];

            return (
              <div key={exam.id} className="exam-entry">
                <div className="exam-row">
                  <div>
                    <h3>{exam.title}</h3>
                    <p>{exam.question_count} questions - {exam.status}</p>
                    <label className="pass-score-control">
                      <span>Pass</span>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={passScoreByExam[exam.id] ?? exam.pass_score ?? 80}
                        onChange={(event) => handlePassScoreChange(exam, event.target.value)}
                      />
                      <span>%</span>
                    </label>
                  </div>
                  <div className="exam-actions">
                    <div className="icon-actions">
                      <button
                        className="icon-action"
                        title="Edit answer key"
                        aria-label="Edit answer key"
                        onClick={() => onReview({ examId: exam.id, title: exam.title })}
                      >
                        ✎
                      </button>
                      <button
                        className="icon-action delete-exam"
                        title="Delete exam"
                        aria-label="Delete exam"
                        onClick={() => handleDelete(exam)}
                      >
                        🗑
                      </button>
                    </div>
                    <div className="start-controls">
                      <input
                        type="number"
                        min="1"
                        value={timeByExam[exam.id] ?? 30}
                        onChange={(event) => setTimeByExam({
                          ...timeByExam,
                          [exam.id]: event.target.value,
                        })}
                        disabled={exam.status !== 'ready'}
                      />
                      <span>min</span>
                      <button
                        className="take-exam"
                        disabled={exam.status !== 'ready'}
                        title={exam.status === 'ready' ? 'Start exam' : 'Save answer key before starting'}
                        onClick={() => onStart(exam, getExamMinutes(exam.id))}
                      >
                        Take exam
                      </button>
                      <button className="history-btn" onClick={() => toggleHistory(exam)}>
                        History
                      </button>
                    </div>
                  </div>
                </div>

                {expandedHistory === exam.id && (
                  <div className="history-panel">
                    {history.length === 0 ? (
                      <p className="history-empty">No attempts yet.</p>
                    ) : (
                      <>
                        <div className="history-panel-actions">
                          <button
                            type="button"
                            className="clear-history-btn"
                            onClick={() => handleClearHistory(exam)}
                          >
                            Clear history
                          </button>
                        </div>
                        {history.map((attempt) => (
                          <details key={attempt.id} className="history-attempt">
                            <summary>
                              <span>{new Date(attempt.submitted_at).toLocaleString()}</span>
                              <b>{Number(attempt.score)}% - {attempt.final_grade}</b>
                            </summary>
                            <div className="history-details">
                              <div className="history-attempt-actions">
                                <button
                                  type="button"
                                  className="delete-history-btn"
                                  onClick={() => handleDeleteHistoryAttempt(exam, attempt.id)}
                                >
                                  Delete attempt
                                </button>
                              </div>
                              {(attempt.details || []).map((item, index) => (
                                <div
                                  key={item.questionId || index}
                                  className={`history-question ${item.isCorrect ? 'correct' : 'wrong'}`}
                                >
                                  <div className="history-question-head">
                                    <strong>{index + 1}. {item.questionText}</strong>
                                    <span>{item.isCorrect ? 'Correct' : 'Wrong'}</span>
                                  </div>
                                  <p>Your answer: {item.selectedOptionText || 'No answer'}</p>
                                  <p>Correct answer: {item.correctOptionText || '-'}</p>
                                </div>
                              ))}
                            </div>
                          </details>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ExamLibrary;
