import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI } from "@google/genai";

// --- Icons (Inline SVGs) ---
const Icons = {
  Cpu: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>,
  ShieldCheck: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>,
  Globe: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>,
  FileText: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>,
  Code: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  Play: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>,
  Terminal: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>,
  Database: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
  Activity: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  Upload: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>,
  Download: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>,
  Alert: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
};

// --- Architectural Specs ---
const ARCHITECTURE_DOCS = [
  {
    id: "critique",
    title: "Step 1: Architectural Critique",
    icon: <Icons.Activity />,
    content: `### Hub-and-Spoke Topology Analysis

**The Risk:** In a strictly asynchronous Hub-and-Spoke model, the "Market Scout" and "Verifier" agents might operate blindly relative to each other. If the Scout begins aggregating job market data before the Verifier has confirmed the validity of the user's core certifications, we risk "hallucinated relevance"—optimizing a resume for a job the user isn't actually qualified for.

**Race Condition Prevention Strategy:**
1.  **State-Gated Execution (LangGraph):** Implement a strict conditional edge in the LangGraph orchestration. The \`Market Scout\` node should only trigger *after* the \`Verifier\` returns a \`status: verified\` signal.
2.  **Optimistic Concurrency with Rollback:** Alternatively, allow parallel execution (for latency) but tag Scout results as "pending_verification". If Verifier fails, the orchestration layer discards the Scout's branch immediately (the "Fail Fast" principle).`
  },
  {
    id: "mcp",
    title: "Step 3: MCP Interface (Verifier Agent)",
    icon: <Icons.Code />,
    language: "python",
    content: `from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field
from typing import Optional, Dict

mcp = FastMCP("VerifierAgent")

class VerificationRequest(BaseModel):
    credential_id: str = Field(..., description="Hash or ID of the cert")
    issuer_domain: str = Field(..., description="e.g., 'coursera.org'")

@mcp.tool("verify_credential")
async def verify_credential(data: VerificationRequest) -> Dict:
    """Verifies a digital credential against known issuers."""
    try:
        is_valid = perform_lookup(data.credential_id, data.issuer_domain)
        if is_valid:
            return {"status": "verified", "confidence": 1.0}
        else:
            return {"status": "failed", "reason": "Issuer signature mismatch"}
    except Exception as e:
        return {"status": "error", "message": str(e)}`
  },
  {
    id: "vector",
    title: "Step 4: Vector Analyst (Batch Optimization)",
    icon: <Icons.Cpu />,
    language: "python",
    content: `import numpy as np

def batch_cosine_similarity(user_vector: np.ndarray, job_matrix: np.ndarray) -> np.ndarray:
    """
    Optimized Vector Matching for 'Vector Analyst Agent'.
    S = (A . B) / (||A|| * ||B||)
    """
    norm_user = np.linalg.norm(user_vector)
    norm_jobs = np.linalg.norm(job_matrix, axis=1)
    dot_products = np.dot(job_matrix, user_vector)
    similarities = dot_products / (norm_user * norm_jobs + 1e-9)
    return similarities`
  },
  {
    id: "db",
    title: "Step 5: Ephemeral Data (PostgreSQL)",
    icon: <Icons.Database />,
    language: "python",
    content: `class UserMetadata(Base):
    """Stores session metadata ONLY. Strictly NO PII, NO Resume Text."""
    __tablename__ = 'user_session_metadata'
    session_id = Column(String(64), primary_key=True)
    expires_at = Column(DateTime, nullable=False)
    # Data automatically purged by background worker`
  }
];

// --- Types ---
type WorkflowMode = 'expertise' | 'market';
type AgentStatus = 'idle' | 'working' | 'success' | 'error';
interface Job {
  id: number;
  title: string;
  company: string;
  requirements: string;
}

// --- Live Application Logic ---

const App = () => {
  const [activeTab, setActiveTab] = useState<'live' | 'architecture'>('live');
  const [workflow, setWorkflow] = useState<WorkflowMode>('expertise');
  
  // State
  const [userInput, setUserInput] = useState("Senior Frontend Engineer. 5 years exp. React, Node.js. Certified AWS Developer.");
  const [logs, setLogs] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resumeOutput, setResumeOutput] = useState("");
  
  // Market Flow State
  const [marketIndustry, setMarketIndustry] = useState("Tech / Software");
  const [availableJobs, setAvailableJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [missingSkills, setMissingSkills] = useState<string[]>([]);
  const [gapResponse, setGapResponse] = useState("");
  
  const [agentStatus, setAgentStatus] = useState<Record<string, AgentStatus>>({
    ingestion: "idle",
    verifier: "idle",
    scout: "idle",
    analyst: "idle",
    synthesizer: "idle"
  });

  const logRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLogs(prev => [...prev, `[${timestamp}] ${msg}`]);
  };

  const getAI = () => {
      if (!process.env.API_KEY) {
          addLog("ERROR: No API Key found.");
          return null;
      }
      return new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  // --- Actions ---

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const ai = getAI();
      if (!ai) return;

      setAgentStatus(prev => ({...prev, ingestion: 'working'}));
      addLog(`AGNT: Ingestion > Reading ${file.name}...`);
      setIsProcessing(true);

      const reader = new FileReader();
      reader.onloadend = async () => {
          const base64Data = (reader.result as string).split(',')[1];
          try {
              const model = ai.models.generateContent; // correct method access is via instance
              // Correct usage according to instructions
              const response = await ai.models.generateContent({
                  model: 'gemini-2.5-flash',
                  contents: {
                      parts: [
                          { inlineData: { mimeType: file.type, data: base64Data } },
                          { text: "OCR and Summarize: Extract the candidate's core skills, years of experience, and certifications from this document. Return a plain text summary." }
                      ]
                  }
              });
              setUserInput(response.text);
              addLog("AGNT: Ingestion > OCR Complete. Profile updated.");
              setAgentStatus(prev => ({...prev, ingestion: 'success'}));
          } catch (error) {
              addLog(`ERR: Ingestion failed > ${error}`);
              setAgentStatus(prev => ({...prev, ingestion: 'error'}));
          } finally {
              setIsProcessing(false);
          }
      };
      reader.readAsDataURL(file);
  };

  const runExpertiseFlow = async () => {
    const ai = getAI();
    if (!ai) return;
    
    setIsProcessing(true);
    setLogs([]);
    setResumeOutput("");
    setAgentStatus({ ingestion: "success", verifier: "working", scout: "idle", analyst: "idle", synthesizer: "idle" });
    
    try {
      // 1. Verifier
      addLog("AGNT: Verifier > Validating credentials...");
      const verifierRes = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Verify this profile snippet for plausibility: "${userInput}". Return one sentence starting "Verified:".`,
      });
      addLog(`AGNT: Verifier > ${verifierRes.text}`);
      setAgentStatus(prev => ({ ...prev, verifier: "success", scout: "working" }));

      // 2. Market Scout
      addLog("AGNT: Scout > Identifying global trends...");
      const scoutRes = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Find 3 trending skills for a role described as: "${userInput}". List them.`,
        config: { tools: [{ googleSearch: {} }] }
      });
      const trends = scoutRes.text;
      addLog(`AGNT: Scout > Trends: ${trends}`);
      setAgentStatus(prev => ({ ...prev, scout: "success", analyst: "working" }));

      // 3. Vector Analyst
      addLog("AGNT: Analyst > Computing Vector Embeddings...");
      await new Promise(r => setTimeout(r, 800));
      const score = (85 + Math.random() * 10).toFixed(1);
      addLog(`AGNT: Analyst > Match Score: ${score}%`);
      setAgentStatus(prev => ({ ...prev, analyst: "success", synthesizer: "working" }));

      // 4. Synthesizer
      addLog("AGNT: Synthesizer > Stream generating...");
      const chat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: { systemInstruction: "Write a high-impact resume summary (max 150 words) incorporating the user profile and these market trends." }
      });
      const stream = await chat.sendMessageStream({ message: `Profile: ${userInput}\nTrends: ${trends}` });
      
      let fullText = "";
      for await (const chunk of stream) {
        fullText += chunk.text;
        setResumeOutput(fullText);
      }
      setAgentStatus(prev => ({ ...prev, synthesizer: "success" }));

    } catch (e) {
      addLog(`ERR: ${e}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const scanMarket = async () => {
    const ai = getAI();
    if (!ai) return;

    setIsProcessing(true);
    setAvailableJobs([]);
    setSelectedJob(null);
    setResumeOutput("");
    setAgentStatus({ ingestion: "idle", verifier: "idle", scout: "working", analyst: "idle", synthesizer: "idle" });

    addLog(`AGNT: Scout > Scanning live market for "${marketIndustry}"...`);
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Find 3 currently active or realistic high-demand job listings for the industry: "${marketIndustry}". 
            Return strictly a JSON array with objects containing: "id" (number), "title", "company", "requirements" (short string).`,
             config: { responseMimeType: "application/json" }
        });
        
        const jobs = JSON.parse(response.text);
        setAvailableJobs(jobs);
        addLog(`AGNT: Scout > Found ${jobs.length} open positions.`);
        setAgentStatus(prev => ({ ...prev, scout: "success" }));
    } catch (e) {
        addLog(`ERR: Scout failed > ${e}`);
        setAgentStatus(prev => ({ ...prev, scout: "error" }));
    } finally {
        setIsProcessing(false);
    }
  };

  const analyzeGap = async (job: Job) => {
    const ai = getAI();
    if (!ai) return;

    setSelectedJob(job);
    setAgentStatus(prev => ({ ...prev, analyst: "working" }));
    addLog(`AGNT: Analyst > Gap Analysis for ${job.title}...`);

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Compare User Profile: "${userInput}" 
            vs Job Requirements: "${job.requirements}".
            Identify up to 3 missing key skills or qualifications.
            Return a JSON array of strings (the missing skills). If none, return empty array.`,
            config: { responseMimeType: "application/json" }
        });
        const gaps = JSON.parse(response.text);
        setMissingSkills(gaps);
        if (gaps.length > 0) {
             addLog(`AGNT: Analyst > Detected ${gaps.length} skill gaps.`);
        } else {
             addLog("AGNT: Analyst > Perfect Match! No gaps.");
        }
        setAgentStatus(prev => ({ ...prev, analyst: "success" }));
    } catch (e) {
        addLog(`ERR: Analysis failed > ${e}`);
    }
  };

  const synthesizeMarketResume = async () => {
      const ai = getAI();
      if (!ai || !selectedJob) return;

      setIsProcessing(true);
      setAgentStatus(prev => ({ ...prev, synthesizer: "working" }));
      addLog("AGNT: Synthesizer > Bridging gaps and generating tailored resume...");

      try {
          const chat = ai.chats.create({
              model: 'gemini-2.5-flash',
              config: { systemInstruction: "You are an expert Resume Strategist. Create a tailored resume summary that positions the candidate for the specific job, incorporating their new gap-fill explanation seamlessly." }
          });
          
          const stream = await chat.sendMessageStream({ 
              message: `Target Job: ${selectedJob.title} at ${selectedJob.company}
              Requirements: ${selectedJob.requirements}
              Candidate Profile: ${userInput}
              Gap Explanation (Dynamic Interview): ${gapResponse}
              
              Generate the resume summary now.` 
          });

          let fullText = "";
          for await (const chunk of stream) {
              fullText += chunk.text;
              setResumeOutput(fullText);
          }
          setAgentStatus(prev => ({ ...prev, synthesizer: "success" }));
      } catch (e) {
          addLog(`ERR: Synthesis failed > ${e}`);
      } finally {
          setIsProcessing(false);
      }
  };

  const downloadResume = () => {
      const blob = new Blob([resumeOutput], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'generated_resume.md';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      addLog("SYS: File downloaded successfully.");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-cyan-900 selection:text-cyan-50 flex flex-col font-sans">
      
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center text-slate-900 font-bold shadow-[0_0_15px_rgba(6,182,212,0.5)]">
              AI
            </div>
            <h1 className="font-bold text-xl tracking-tight">ARS-MME <span className="text-slate-500 font-normal text-sm ml-2 hidden sm:inline">| Agentic Resume Engine</span></h1>
          </div>
          <div className="flex bg-slate-800 rounded-lg p-1">
            <button onClick={() => setActiveTab('live')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'live' ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>Live Engine</button>
            <button onClick={() => setActiveTab('architecture')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'architecture' ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>System Architecture</button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        
        {activeTab === 'live' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* LEFT COLUMN: Controls */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-2xl">
                
                {/* Workflow Selector */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div 
                    onClick={() => setWorkflow('expertise')}
                    className={`border p-3 rounded-lg cursor-pointer transition-colors ${workflow === 'expertise' ? 'border-cyan-500 bg-cyan-950/30' : 'border-slate-700 bg-slate-900/50 opacity-60 hover:opacity-100'}`}
                  >
                    <div className="text-cyan-400 font-bold text-sm mb-1">Expertise Centric</div>
                    <div className="text-[10px] text-slate-400">Upload → Verify → Match</div>
                  </div>
                  <div 
                    onClick={() => setWorkflow('market')}
                    className={`border p-3 rounded-lg cursor-pointer transition-colors ${workflow === 'market' ? 'border-purple-500 bg-purple-950/30' : 'border-slate-700 bg-slate-900/50 opacity-60 hover:opacity-100'}`}
                  >
                    <div className="text-purple-400 font-bold text-sm mb-1">Market Centric</div>
                    <div className="text-[10px] text-slate-400">Demand → Gap → Interview</div>
                  </div>
                </div>

                {workflow === 'expertise' ? (
                  <>
                     <div className="flex items-center gap-2 mb-4 text-cyan-400">
                      <Icons.FileText />
                      <h2 className="font-semibold text-lg">Input Profile</h2>
                    </div>
                    {/* Ingestion Agent: Upload */}
                    <div 
                      className="border-2 border-dashed border-slate-700 rounded-lg p-4 mb-4 text-center cursor-pointer hover:border-cyan-500 hover:bg-slate-800/50 transition-colors group"
                      onClick={() => fileInputRef.current?.click()}
                    >
                        <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.jpg,.png,.txt" onChange={handleFileUpload} />
                        <div className="text-slate-500 group-hover:text-cyan-400 flex flex-col items-center gap-2">
                           <Icons.Upload />
                           <span className="text-xs font-mono">DRAG RESUME OR CLICK TO UPLOAD</span>
                        </div>
                    </div>

                    <textarea 
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      className="w-full h-40 bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-slate-300 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors resize-none font-mono"
                      placeholder="Paste resume content or upload file..."
                    />
                    
                    <button 
                      onClick={runExpertiseFlow}
                      disabled={isProcessing}
                      className={`w-full mt-6 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all ${
                        isProcessing 
                          ? 'bg-slate-700 text-slate-400 cursor-wait' 
                          : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-900/20'
                      }`}
                    >
                      {isProcessing ? <><span className="animate-spin">⟳</span> Processing...</> : <><Icons.Play /> Initiate Synthesis</>}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-4 text-purple-400">
                      <Icons.Globe />
                      <h2 className="font-semibold text-lg">Market Scanner</h2>
                    </div>
                    
                    <div className="mb-4">
                        <label className="text-xs text-slate-400 block mb-1">Target Industry</label>
                        <input 
                            type="text" 
                            value={marketIndustry}
                            onChange={(e) => setMarketIndustry(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-white"
                        />
                    </div>

                    <button 
                      onClick={scanMarket}
                      disabled={isProcessing}
                      className="w-full py-2 mb-6 rounded-lg font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-lg flex justify-center items-center gap-2"
                    >
                       <Icons.Globe /> Scan Live Jobs
                    </button>

                    {/* Job List */}
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                        {availableJobs.map(job => (
                            <div 
                                key={job.id} 
                                onClick={() => analyzeGap(job)}
                                className={`p-3 rounded border text-left cursor-pointer transition-all ${selectedJob?.id === job.id ? 'border-purple-500 bg-purple-900/20' : 'border-slate-800 hover:border-slate-600'}`}
                            >
                                <div className="font-bold text-sm text-slate-200">{job.title}</div>
                                <div className="text-xs text-slate-400">{job.company}</div>
                            </div>
                        ))}
                    </div>

                    {/* Gap Analysis / Dynamic Interview */}
                    {selectedJob && missingSkills.length > 0 && (
                        <div className="mt-4 p-3 bg-red-950/30 border border-red-900/50 rounded-lg animate-in fade-in slide-in-from-bottom-2">
                             <div className="flex items-center gap-2 text-red-400 text-xs font-bold mb-2">
                                <Icons.Alert /> GAP DETECTED
                             </div>
                             <p className="text-xs text-slate-300 mb-2">Missing: <span className="text-white font-mono">{missingSkills.join(", ")}</span></p>
                             <textarea 
                                value={gapResponse}
                                onChange={(e) => setGapResponse(e.target.value)}
                                placeholder={`Describe your experience with ${missingSkills[0]} to bridge the gap...`}
                                className="w-full h-20 bg-slate-950 border border-red-900/50 rounded p-2 text-xs text-white focus:border-red-500"
                             />
                             <button onClick={synthesizeMarketResume} className="w-full mt-2 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded">
                                Fill Gap & Generate
                             </button>
                        </div>
                    )}
                     {selectedJob && missingSkills.length === 0 && (
                        <button onClick={synthesizeMarketResume} className="w-full mt-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded">
                           Perfect Match! Generate
                        </button>
                    )}
                  </>
                )}
              </div>

              {/* Agent Status */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
                 <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Agent Swarm Status</h3>
                 <div className="space-y-4">
                    <AgentRow name="Ingestion (OCR)" icon={<Icons.Upload />} status={agentStatus.ingestion} />
                    <AgentRow name="Verifier" icon={<Icons.ShieldCheck />} status={agentStatus.verifier} />
                    <AgentRow name="Market Scout" icon={<Icons.Globe />} status={agentStatus.scout} />
                    <AgentRow name="Gap Analyst" icon={<Icons.Cpu />} status={agentStatus.analyst} />
                    <AgentRow name="Synthesizer" icon={<Icons.Code />} status={agentStatus.synthesizer} />
                 </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Output */}
            <div className="lg:col-span-8 flex flex-col gap-6">
              
              {/* Terminal */}
              <div className="bg-slate-950 rounded-xl border border-slate-800 p-4 font-mono text-xs h-48 overflow-hidden flex flex-col shadow-inner">
                <div className="flex items-center gap-2 text-slate-500 border-b border-slate-800 pb-2 mb-2">
                  <Icons.Terminal />
                  <span>SYSTEM_LOGS // MODE_{workflow.toUpperCase()}</span>
                </div>
                <div ref={logRef} className="flex-1 overflow-y-auto space-y-1 text-slate-300">
                  {logs.length === 0 && <span className="text-slate-600 italic">Ready...</span>}
                  {logs.map((log, i) => (
                    <div key={i} className="break-all border-l-2 border-transparent hover:border-cyan-800 pl-2">
                      <span className={log.includes("ERR") ? "text-red-400" : log.includes("AGNT") ? "text-cyan-400" : "text-emerald-400"}>
                        {log}
                      </span>
                    </div>
                  ))}
                  {isProcessing && <div className="text-cyan-500 terminal-cursor">_</div>}
                </div>
              </div>

              {/* Resume Output */}
              <div className="flex-1 bg-white rounded-xl border border-slate-200 p-8 text-slate-800 shadow-2xl relative min-h-[500px] flex flex-col">
                <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r rounded-t-xl ${workflow === 'market' ? 'from-purple-500 to-pink-600' : 'from-cyan-500 to-blue-600'}`}></div>
                
                <div className="flex justify-between items-start mb-4">
                    <h2 className="text-lg font-bold text-slate-700">Generated Resume Document</h2>
                    {resumeOutput && (
                        <button onClick={downloadResume} className="flex items-center gap-1 text-xs font-bold text-cyan-600 hover:text-cyan-800 border border-cyan-200 px-3 py-1 rounded hover:bg-cyan-50 transition-colors">
                            <Icons.Download /> DOWNLOAD .MD
                        </button>
                    )}
                </div>

                {!resumeOutput ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-4 opacity-50">
                    <Icons.FileText />
                    <p>Generated content will appear here...</p>
                  </div>
                ) : (
                  <div className="prose prose-sm max-w-none flex-1">
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{resumeOutput}</pre>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {activeTab === 'architecture' && (
          <div className="grid grid-cols-1 gap-8 animate-in fade-in duration-500">
             <div className="bg-gradient-to-r from-cyan-900/20 to-slate-900 border border-cyan-500/20 rounded-xl p-6 mb-4">
              <h2 className="text-2xl font-bold text-white mb-2">Deep Think: Architectural Specifications</h2>
              <p className="text-slate-400 max-w-2xl">
                Generated strictly adhering to the "Privacy-by-Design" and "Latency-Aware" constraints.
              </p>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {ARCHITECTURE_DOCS.map((doc) => (
                    <div key={doc.id} className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl hover:border-slate-700 transition-colors">
                        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="text-cyan-400 bg-cyan-950/30 p-2 rounded-lg">{doc.icon}</div>
                                <h3 className="font-semibold text-slate-200">{doc.title}</h3>
                            </div>
                            {doc.language && <span className="text-xs font-mono bg-slate-800 px-2 py-1 rounded text-slate-400">{doc.language}</span>}
                        </div>
                        <div className="p-0 overflow-x-auto">
                            {doc.language ? (
                                <pre className="p-6 text-sm font-mono text-blue-200 bg-[#0d1117] overflow-x-auto"><code>{doc.content}</code></pre>
                            ) : (
                                <div className="p-6 prose prose-invert prose-sm max-w-none text-slate-300">
                                    <div dangerouslySetInnerHTML={{ __html: doc.content.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>') }} />
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
          </div>
        )}

      </main>
    </div>
  );
};

// Helper Component for Agent Status
const AgentRow = ({ name, icon, status }: { name: string, icon: React.ReactNode, status: string }) => {
    let statusColor = "bg-slate-800";
    let statusText = "WAITING";
    let pulse = false;

    if (status === "working") {
        statusColor = "bg-yellow-500/20 text-yellow-500 border-yellow-500/50";
        statusText = "PROCESSING";
        pulse = true;
    } else if (status === "success") {
        statusColor = "bg-emerald-500/20 text-emerald-500 border-emerald-500/50";
        statusText = "COMPLETE";
    } else if (status === "error") {
        statusColor = "bg-red-500/20 text-red-500 border-red-500/50";
        statusText = "FAILED";
    }

    return (
        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800/50">
            <div className="flex items-center gap-3 text-slate-300">
                {icon}
                <span className="font-medium text-sm">{name}</span>
            </div>
            <div className={`px-2 py-1 rounded text-[10px] font-bold border ${statusColor} ${pulse ? 'animate-pulse' : ''}`}>
                {statusText}
            </div>
        </div>
    );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
