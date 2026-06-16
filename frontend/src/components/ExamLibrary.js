import React, { useEffect, useState } from 'react';
import apiClient from '../services/api';
import './ExamLibrary.css';

function ExamLibrary({ onUpload, onReview, onStart }) {
  const [exams, setExams] = useState([]);
  const [timeByExam, setTimeByExam] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchExams = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/exams');
      setExams(response.data.exams);
    } catch (err) {
      setError('Failed to load exam list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExams();
  }, []);

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
          {exams.map((exam) => (
            <div key={exam.id} className="exam-row">
              <div>
                <h3>{exam.title}</h3>
                <p>{exam.question_count} questions · {exam.status}</p>
              </div>
              {exam.status === 'ready' ? (
                <div className="start-controls">
                  <input
                    type="number"
                    min="1"
                    value={timeByExam[exam.id] || 30}
                    onChange={(event) => setTimeByExam({
                      ...timeByExam,
                      [exam.id]: event.target.value,
                    })}
                  />
                  <span>min</span>
                  <button onClick={() => onStart(exam, Number(timeByExam[exam.id] || 30))}>
                    Start
                  </button>
                </div>
              ) : (
                <button onClick={() => onReview({ examId: exam.id, title: exam.title })}>
                  Check Answers
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ExamLibrary;
