import React from 'react';
import './Results.css';

function Results({ results, onRetry }) {
  const { score, correctCount, totalQuestions, grade, passScore = 80, results: details = [] } = results;
  const percentage = Math.round((correctCount / totalQuestions) * 100);

  return (
    <div className="results-container">
      <div className="results-card">
        <div className="results-header">
          <h2>📊 Exam Results</h2>
        </div>

        <div className="score-display">
          <div className={`score-circle ${grade.toLowerCase()}`}>
            <span className="score-value">{score}%</span>
            <span className="score-label">Score</span>
          </div>
        </div>

        <div className="grade-info">
          <h3>Grade: <span className={`grade-badge ${grade.toLowerCase()}`}>{grade}</span></h3>
        </div>

        <div className="results-breakdown">
          <div className="result-item">
            <span className="result-label">Correct Answers:</span>
            <span className="result-value correct">{correctCount}/{totalQuestions}</span>
          </div>
          <div className="result-item">
            <span className="result-label">Accuracy:</span>
            <span className="result-value">{percentage}%</span>
          </div>
          <div className="result-item">
            <span className="result-label">Pass score:</span>
            <span className="result-value">{passScore}%</span>
          </div>
        </div>

        <div className={`status-message ${grade.toLowerCase()}`}>
          {grade === 'PASS' ? (
            <>
              <p>🎉 Congratulations! You passed the exam!</p>
              <p>Keep up the good work!</p>
            </>
          ) : (
            <>
              <p>⚠️ You did not pass the exam.</p>
              <p>Try again to improve your score!</p>
            </>
          )}
        </div>

        {details.length > 0 && (
          <div className="answer-review">
            <h3>Answer Details</h3>
            {details.map((item, index) => {
              const diagramSrc = item.diagramImageUrl
                ? `http://localhost:5000${item.diagramImageUrl}`
                : item.diagramSvg
                ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(item.diagramSvg)}`
                : null;

              return (
                <div key={item.questionId || index} className={`answer-detail ${item.isCorrect ? 'correct' : 'wrong'}`}>
                  <div className="answer-detail-header">
                    <strong>{index + 1}. {item.questionText}</strong>
                    <span>{item.isCorrect ? 'Correct' : 'Wrong'}</span>
                  </div>
                  {diagramSrc && (
                    <div className="answer-detail-diagram">
                      <img src={diagramSrc} alt="" />
                    </div>
                  )}
                  <p>Your answer: <b>{item.selectedOptionText || 'No answer'}</b></p>
                  <p>Correct answer: <b>{item.correctOptionText || '-'}</b></p>
                </div>
              );
            })}
          </div>
        )}

        <button onClick={onRetry} className="retry-btn">
          Try Another Exam
        </button>
      </div>
    </div>
  );
}

export default Results;
