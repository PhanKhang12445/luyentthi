import React, { useState } from 'react';
import apiClient from '../services/api';
import './FileUpload.css';

function FileUpload({ onSuccess }) {
  const [files, setFiles] = useState([]);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const getFileExtension = (fileName) => {
    const parts = fileName.toLowerCase().split('.');
    return parts.length > 1 ? `.${parts.pop()}` : '';
  };

  const handleFileChange = (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    const validTypes = ['application/pdf', 'text/plain', 'image/jpeg', 'image/png'];
    const validExtensions = ['.pdf', '.txt', '.jpg', '.jpeg', '.png'];

    const invalidFile = selectedFiles.find((selectedFile) => {
      const ext = getFileExtension(selectedFile.name);
      return !validTypes.includes(selectedFile.type) && !validExtensions.includes(ext);
    });

    if (invalidFile) {
      setError('Invalid file type. Please upload PDF, TXT, JPG, or PNG.');
      setFiles([]);
      return;
    }

    setFiles(selectedFiles);
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (files.length === 0 || !title) {
      setError('Please provide both file(s) and exam title.');
      return;
    }

    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('title', title);
    files.forEach((selectedFile) => {
      formData.append('files', selectedFile);
    });

    try {
      const response = await apiClient.post('/exams/create-batch', formData);

      onSuccess(response.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to upload file');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="file-upload-container">
      <div className="upload-card">
        <h2>Upload Exam File</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="title">Exam Title:</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Enter exam title"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="file">Select File(s):</label>
            <input
              id="file"
              type="file"
              onChange={handleFileChange}
              accept=".pdf,.txt,.jpg,.jpeg,.png"
              multiple
              required
            />
            {files.length > 0 && (
              <div className="file-info">
                <p>{files.length} file(s) selected:</p>
                <ul>
                  {files.map((selectedFile) => (
                    <li key={`${selectedFile.name}-${selectedFile.size}`}>{selectedFile.name}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" disabled={loading} className="submit-btn">
            {loading ? 'Processing...' : 'Upload & Parse Exam'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default FileUpload;
