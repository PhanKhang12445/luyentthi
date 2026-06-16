/**
 * API service layer for frontend
 * Handles all HTTP requests to backend
 */

import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// Exam APIs
export const examService = {
  createExamFromFile: async (file, title) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);

    return apiClient.post('/exams/create', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  getExam: async (examId) => {
    return apiClient.get(`/exams/${examId}`);
  },

  submitExam: async (examId, answers) => {
    return apiClient.post('/exams/submit', {
      examId,
      answers,
    });
  },
};

export default apiClient;
