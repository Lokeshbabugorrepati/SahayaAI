// src/App.js
import React, { useState, useRef } from "react";
import axios from "axios";
import Tesseract from "tesseract.js";
import "./App.css";

const OCR_SPACE_KEY = "K84934366888957"; // your OCR.Space API key

function App() {
  const [inputText, setInputText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [lang, setLang] = useState("te");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef();
  const inputSectionRef = useRef();

  const scrollToInput = () => {
    inputSectionRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const enhanceImageBlob = async (file) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.filter = "contrast(180%) brightness(120%)";
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => resolve(blob), "image/png");
      };
      img.onerror = (e) => reject(e);
    });
  };

  const runOCR = async (file) => {
    setErrorMsg("");
    setIsExtracting(true);
    setOcrProgress(1);

    try {
      const enhancedBlob = await enhanceImageBlob(file);
      setImagePreview(URL.createObjectURL(enhancedBlob));

      const form = new FormData();
      form.append("file", enhancedBlob, "enhanced.png");
      form.append("language", "eng");

      const res = await axios.post("https://api.ocr.space/parse/image", form, {
        headers: { apikey: OCR_SPACE_KEY },
        onUploadProgress: (p) =>
          setOcrProgress(Math.round((p.loaded / p.total) * 100)),
      });

      const parsedText = res.data?.ParsedResults?.[0]?.ParsedText || "";
      if (parsedText.trim()) {
        setInputText(parsedText);
        setIsExtracting(false);
        return;
      } else throw new Error("Empty OCR result");
    } catch {
      try {
        const result = await Tesseract.recognize(file, "eng", {
          logger: (m) =>
            setOcrProgress(Math.round(m.progress * 100)),
        });
        setInputText(result.data.text.trim());
      } catch {
        setErrorMsg("Failed to extract text from image.");
      }
    } finally {
      setIsExtracting(false);
      setOcrProgress(100);
    }
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) runOCR(f);
  };

  const translate = async () => {
    if (!inputText.trim()) {
      setErrorMsg("Please enter or extract text first.");
      return;
    }
    setIsTranslating(true);
    try {
      const res = await axios.get("https://api.mymemory.translated.net/get", {
        params: { q: inputText, langpair: `en|${lang}` },
      });
      setTranslatedText(res.data?.responseData?.translatedText || "");
    } catch {
      setErrorMsg("Translation failed.");
    } finally {
      setIsTranslating(false);
    }
  };

  const speak = () => {
    if (!translatedText) return;
    const utter = new SpeechSynthesisUtterance(translatedText);
    utter.lang = lang === "te" ? "te-IN" : "en-IN";
    window.speechSynthesis.speak(utter);
  };

  return (
    <div className="app-gradient">
      {/* Hero Section */}
      <header className="hero fade-in">
        <div className="hero-inner">
          <h1 className="ai-glow">Sahaya<span className="ai-highlight">AI</span></h1>
          <p className="tag slide-up">
            Empowering Communities Through Language and AI
          </p>
          <div className="hero-buttons slide-up">
            <button className="btn primary big" onClick={scrollToInput}>
              🚀 Get Started
            </button>
            <button
              className="btn glass big"
              onClick={() => fileInputRef.current?.click()}
            >
              📷 Upload Image
            </button>
          </div>
        </div>
      </header>

      {/* Main Section */}
      <main className="container fade-in" ref={inputSectionRef}>
        {/* Input Card */}
        <section className="card upload-card slide-left">
          <h2>Input</h2>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type English text here or upload an image below to extract text..."
            rows={6}
          />
          <div className="file-row">
            <div className="file-drop">
              <p>Drag & drop an image or click below</p>
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handleFileChange}
              />
              <button className="btn" onClick={() => fileInputRef.current?.click()}>
                Choose Image
              </button>
            </div>
            <div className="preview">
              {imagePreview ? (
                <img src={imagePreview} alt="preview" />
              ) : (
                <div className="preview-empty">Image preview will appear here</div>
              )}
            </div>
          </div>
          {isExtracting && (
            <div className="progress">
              <div className="bar" style={{ width: `${ocrProgress}%` }}></div>
              <small>Extracting... {ocrProgress}%</small>
            </div>
          )}
        </section>

        {/* Output Card */}
        <section className="card output-card slide-right">
          <h2>Translate & Speak</h2>
          <div className="controls">
            <label>Choose Language</label>
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              <option value="te">Telugu</option>
              <option value="hi">Hindi</option>
              <option value="ta">Tamil</option>
              <option value="kn">Kannada</option>
            </select>
            <div className="action-row">
              <button className="btn primary" onClick={translate} disabled={isTranslating}>
                {isTranslating ? "Translating..." : "Translate"}
              </button>
              <button className="btn" onClick={speak}>🔊 Speak</button>
            </div>
          </div>
          <div className="result">
            <h3>Translated Text</h3>
            <div className="result-box">
              {translatedText || <span className="muted">Translation will appear here...</span>}
            </div>
          </div>
          {errorMsg && <div className="error">{errorMsg}</div>}
        </section>
      </main>

      {/* Footer */}
      <footer className="footer fade-in">
        <small>Developed by Lokesh Babu Gorrepati • SahayaAI</small>
      </footer>
    </div>
  );
}

export default App;
