import React, { useState } from 'react';
import './App.css';
import AuthPage from './components/AuthPage';
import FileUpload from './components/FileUpload';
import ExamLibrary from './components/ExamLibrary';
import ExamReview from './components/ExamReview';
import ExamTaker from './components/ExamTaker';
import Results from './components/Results';

function App() {
  const [currentPage, setCurrentPage] = useState('library');
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('authUser');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [examData, setExamData] = useState(null);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(30);
  const [examResults, setExamResults] = useState(null);

  const handleFileUploadSuccess = (exam) => {
    setExamData(exam);
    setCurrentPage('review');
  };

  const handleReviewSaved = () => {
    setExamData(null);
    setCurrentPage('library');
  };

  const handleStartExam = (exam, minutes) => {
    setExamData({
      examId: exam.id,
      title: exam.title,
      passScore: exam.pass_score || exam.passScore || 80,
    });
    setTimeLimitMinutes(minutes);
    setExamResults(null);
    setCurrentPage('exam');
  };

  const handleExamSubmit = (results) => {
    setExamResults(results);
    setCurrentPage('results');
  };

  const handleRetry = () => {
    setExamData(null);
    setExamResults(null);
    setCurrentPage('library');
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    setUser(null);
    setExamData(null);
    setExamResults(null);
    setCurrentPage('library');
  };

  if (!user) {
    return (
      <div className="App">
        <header className="App-header">
          <h1>Exam Preparation Application</h1>
        </header>
        <main className="App-main">
          <AuthPage onAuthenticated={setUser} />
        </main>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>📚 Exam Preparation Application</h1>
      </header>

      <main className="App-main">
        <div className="user-strip">
          <span>{user.displayName} · {user.email}</span>
          <button onClick={handleLogout}>Logout</button>
        </div>

        {currentPage === 'library' && (
          <ExamLibrary
            onUpload={() => setCurrentPage('upload')}
            onReview={(exam) => {
              setExamData(exam);
              setCurrentPage('review');
            }}
            onStart={handleStartExam}
          />
        )}
        {currentPage === 'upload' && (
          <FileUpload onSuccess={handleFileUploadSuccess} />
        )}
        {currentPage === 'review' && examData && (
          <ExamReview
            examData={examData}
            onSaved={handleReviewSaved}
            onCancel={() => {
              setExamData(null);
              setCurrentPage('library');
            }}
          />
        )}
        {currentPage === 'exam' && examData && (
          <ExamTaker
            examData={examData}
            timeLimitMinutes={timeLimitMinutes}
            onSubmit={handleExamSubmit}
          />
        )}
        {currentPage === 'results' && examResults && (
          <Results results={examResults} onRetry={handleRetry} />
        )}
      </main>
    </div>
  );
}

export default App;
