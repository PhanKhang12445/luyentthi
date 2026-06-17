import React, { useEffect, useState } from 'react';
import apiClient from '../services/api';
import './ExamReview.css';

function ExamReview({ examData, onSaved, onCancel }) {
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [cropQuestionId, setCropQuestionId] = useState(null);
  const [cropStart, setCropStart] = useState(null);
  const [cropBox, setCropBox] = useState(null);
  const [cropSaving, setCropSaving] = useState(false);

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

  const getPointerPosition = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const startCrop = (questionId) => {
    setCropQuestionId(questionId);
    setCropStart(null);
    setCropBox(null);
  };

  const handleCropMouseDown = (event) => {
    const position = getPointerPosition(event);
    setCropStart(position);
    setCropBox({ left: position.x, top: position.y, width: 0, height: 0 });
  };

  const handleCropMouseMove = (event) => {
    if (!cropStart) return;

    const position = getPointerPosition(event);
    setCropBox({
      left: Math.min(cropStart.x, position.x),
      top: Math.min(cropStart.y, position.y),
      width: Math.abs(position.x - cropStart.x),
      height: Math.abs(position.y - cropStart.y),
    });
  };

  const handleCropMouseUp = () => {
    setCropStart(null);
  };

  const saveCrop = async (question) => {
    if (!cropBox || cropBox.width < 10 || cropBox.height < 10) {
      setError('Please drag a crop region on the original image.');
      return;
    }

    const image = document.getElementById(`source-image-${question.id}`);
    if (!image) return;

    const scaleX = image.naturalWidth / image.clientWidth;
    const scaleY = image.naturalHeight / image.clientHeight;

    setCropSaving(true);
    setError('');

    try {
      const response = await apiClient.post(
        `/exams/${examData.examId}/questions/${question.id}/diagram-crop`,
        {
          crop: {
            left: cropBox.left * scaleX,
            top: cropBox.top * scaleY,
            width: cropBox.width * scaleX,
            height: cropBox.height * scaleY,
          },
        }
      );

      setQuestions((current) => current.map((item) => (
        item.id === question.id
          ? { ...item, diagramImageUrl: response.data.diagramImageUrl, diagramSvg: null }
          : item
      )));
      setCropQuestionId(null);
      setCropBox(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save crop');
    } finally {
      setCropSaving(false);
    }
  };

  const removeDiagram = async (question) => {
    setError('');

    try {
      await apiClient.delete(`/exams/${examData.examId}/questions/${question.id}/diagram`);
      setQuestions((current) => current.map((item) => (
        item.id === question.id
          ? { ...item, diagramImageUrl: null, diagramSvg: null }
          : item
      )));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to remove image');
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
          const sourceImageSrc = question.sourceImageUrl
            ? `http://localhost:5000${question.sourceImageUrl}`
            : null;
          const isCropping = cropQuestionId === question.id;

          return (
            <section key={question.id} className="review-question">
              <h3>{question.questionNumber || index + 1}. {question.text}</h3>
              {diagramSrc && (
                <div className="review-diagram">
                  <button
                    type="button"
                    className="diagram-remove"
                    aria-label="Remove diagram image"
                    title="Remove image"
                    onClick={() => removeDiagram(question)}
                  >
                    ×
                  </button>
                  <img src={diagramSrc} alt="" />
                </div>
              )}
              {sourceImageSrc && (
                <div className="crop-tools">
                  <button type="button" onClick={() => startCrop(question.id)}>
                    Adjust image crop
                  </button>
                </div>
              )}
              {sourceImageSrc && isCropping && (
                <div className="crop-editor">
                  <div
                    className="crop-stage"
                    onMouseDown={handleCropMouseDown}
                    onMouseMove={handleCropMouseMove}
                    onMouseUp={handleCropMouseUp}
                    onMouseLeave={handleCropMouseUp}
                  >
                    <img id={`source-image-${question.id}`} src={sourceImageSrc} alt="" draggable="false" />
                    {cropBox && (
                      <div
                        className="crop-box"
                        style={{
                          left: `${cropBox.left}px`,
                          top: `${cropBox.top}px`,
                          width: `${cropBox.width}px`,
                          height: `${cropBox.height}px`,
                        }}
                      />
                    )}
                  </div>
                  <div className="crop-actions">
                    <button type="button" onClick={() => saveCrop(question)} disabled={cropSaving}>
                      {cropSaving ? 'Saving crop...' : 'Save crop'}
                    </button>
                    <button type="button" onClick={() => setCropQuestionId(null)}>
                      Cancel
                    </button>
                  </div>
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

      <div className="review-actions">
        <button className="review-cancel" type="button" onClick={onCancel} disabled={saving}>
          Don't save
        </button>
        <button className="review-save" type="button" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Answer Key'}
        </button>
      </div>
    </div>
  );
}

export default ExamReview;
