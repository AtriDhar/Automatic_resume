# **Software Requirements Specification (SRS)**

## **Project Name: Agentic Resume Synthesis & Market Matching Engine (ARS-MME)**

Version: 1.0

Status: Approved for Development

Architecture Pattern: Decentralized Agentic Architecture (MCP Compliant)

## **1\. Introduction**

### **1.1 Purpose**

The purpose of this document is to define the functional and non-functional requirements for the **ARS-MME**. This system is an AI-driven platform designed to generate context-aware, highly optimized resumes via two distinct user workflows. The system leverages Multi-modal inputs, RAG, and a zero-retention storage policy to minimize infrastructure costs while maximizing output relevance.

### **1.2 Scope**

The system acts as a **Just-In-Time (JIT) Content Generator**. It does not function as a traditional cloud storage drive.

- **In-Scope:** Multi-modal ingestion (Text/Image/PDF), Real-time Job Market Analysis via Agents, Credential Verification, Vector-based Skill Matching, and Ephemeral (Session-based) Resume Generation.
- **Out-of-Scope:** Long-term storage of generated resumes.

### **1.3 Definitions & Acronyms**

- **MCP (Model Context Protocol):** The standard used for connecting AI assistants to systems/tools.
- **RAG:** Retrieval-Augmented Generation.
- **Ephemeral Storage:** Temporary storage that is wiped upon session termination.
- **Vector Embedding:** Numerical representation of skills/jobs to calculate semantic similarity.

## **2\. Overall Description**

### **2.1 Product Perspective**

The system functions as a web-based interface backed by a **Multi-Agent System (MAS)**.

- **Frontend:** React/Next.js (Suggested) for responsive design.
- **Backend Orchestrator:** Python (FastAPI/LangGraph) utilizing MCP to connect agents.
- **Database:**
  - _Persistent:_ PostgreSQL (User Metadata only: Name, Email, Phone, Auth).
  - _Transient:_ Redis/In-Memory Vector Store (Processing session data).

### **2.2 User Characteristics**

- **The Job Seeker (User):** Varies from entry-level to executive. Requires intuitive UI.
- **System Admin:** Manages Agent API quotas and System Health.

### **2.3 Key Assumptions**

- Users will provide truthful data for verification.
- Third-party APIs (LinkedIn, Indeed, Glassdoor, etc.) are accessible via the Market Agent.
- The client acknowledges that "Zero Storage" means users typically lose access to the generated file once the tab is closed.

## **3\. System Architecture & Agentic Design**

_Fabricated based on "Any possible architecture in the vast space of agentic AI"_

The system shall utilize a **Hub-and-Spoke Agentic Topology** governed by MCP.

### **3.1 The Agent Swarm**

- **Orchestrator Agent (The Brain):** Routes user intent to Form 1 or Form 2 workflows.
- **Ingestion Agent (Multi-Modal):** Capable of OCR (Optical Character Recognition) to read uploaded certificates (PDF/JPG) and parse user descriptions.
- **Verifier Agent:** Cross-references uploaded certifications against known issuer databases or heuristic validity checks.
- **Market Scout Agent:** Performs real-time RAG operations, scraping current job listings and "Top Demand" posts.
- **Vector Analyst Agent:** Maps User Skills (\$\\vec{U}\$) and Job Requirements (\$\\vec{J}\$) into high-dimensional space to calculate Cosine Similarity.
- **Synthesizer Agent:** The LLM writer that generates the final PDF/Docx.

## **4\. Functional Requirements**

### **4.1 Form 1: User-Expertise Centric Flow**

- **FR-1.1:** The system shall accept multi-modal input (text description of experience + uploads of certificates).
- **FR-1.2:** The **Verifier Agent** must validate credentials immediately upon upload.
  - _Constraint:_ If verification fails, the user is prompted to manually correct or override with a disclaimer.
- **FR-1.3:** The **Market Scout Agent** shall autonomously identify currently trending job roles relevant to the validated skills.
- **FR-1.4:** The system shall generate a resume tailored to these trending roles using RAG context.
- **FR-1.5:** The system shall provide a "One-Click Download" link.
- **FR-1.6:** Upon session end (browser close or timeout), all uploaded documents and generated resumes must be permanently purged from the server.

### **4.2 Form 2: Market-Demand Centric Flow**

- **FR-2.1:** The system shall display a live dashboard of "Top Job Openings" grouped by industry/metric.
- **FR-2.2:** Upon user selection of a specific Job Opening, the system shall analyze the gap between the Job Requirements and the User's known profile.
- **FR-2.3:** The system shall prompt the user specifically for missing skills or proofs required by that specific job (Dynamic Interview Mode).
- **FR-2.4:** The system shall synthesize the resume _only_ after the specific gap-fill data is provided.

### **4.3 Shared Core Logic (Vector Matching)**

- **FR-3.1:** The system shall convert all text inputs into vector embeddings.
- FR-3.2: The matching algorithm shall prioritize results where the similarity score \$S\$ is maximized:
- ![](data:image/png;base64,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i39hi5LvAtfpdKxbt96grF6dOg7odLoKAzdAr169GDy46senS5cu6lUI8UjJnbcQ1UxAQACzZs0EYNq0acqwsLOzMzNmfICLiyvjxo17qN/jPW3aVLp27cq2bdt4773xALz++kiaNm3GyJEjmTHjA5o2bconn3yqvJM+e/ZsWrcOYeHChdy8mcFbb73JV199xcqV3yv5jz3WgBdffAmdTscXX3yOi4sLI0e+bvAK3LJlX1GjRg2ef/4Fhg9/hf79+7N69RoWLlyolNHz8PBg4cJPSUlJKTOR7WEZOXIksbGxxMbGEhgYiLe3N6tXr1YXu2seHh707NmD9et/IjExkU6dOmJhYcnmzZvvqMy9eNDrF5WTO28hqhlfX18Arly5wgcffMAXX3zO7NmzWbbsKxwcHJg5c8ZDDdyUfKvZtm3baN++PZs3b+bHH/9L69atWbr0S3Q6He+9N579+w/wxhuvs3btj2zevImmTQNYvHixEqxNTU0ZMmQIX3zxOd988zXNmjVl48ZNyghCUlISdnZ2+Pr6GHz2li1bcXZ25rvvVtC7d+8KAzeAr68PNja2Bl/k8rA1a9ZM+f7woKAgevXqqS5Shre3N4sWLWLs2Mpf/3N2diYgoCnOzs4AtGr1NN27/+uOynTv/i+mT59227+XX365wt8Fr2z94sGT4C1ENZOUlMi8efMYMGAg48eP59y5c2RlZfHppwvp2bNXmQlaD4M+QHfv3oNPPvmEjz9eQN++/ZRt0el0jB49mt69+7BkyefMmjWbjh078e23KwA4dOgQQ4cOo0ePnqxatYpvvvmGHj16snz5P79YFRd3mMLCQho1aqSkUfLq19Chw/j6668ZMGBghYEboFGjRhQVFXL48GF11kNjaWmBo6OjOvm2+vXrS8uWLejUqRMhIcHq7DJq1rSmVq3bz2e4XRk/Pz/atWtHx44dCQsLIywsjI4dO9KuXTvatWtHaGgor732KkuWRPL99ysJDAxUr+K26xcPngRvIaqZffv2s23bdgCio2OYMWMmU6ZMYevWreqiD11qaipRUVHs3btXnQW3yU9NTSUhIQGdTseOHTvZsWNnmWf2W7du5fz58zRv3rzMt6clJCSwbdv22762pdFoaN68OcePH1eO36NgampKzZo11ckV0mg0NG7cGFNT0zLzCipibm6OpaWVOtnA7crMnDmL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)  
    \$\$S = \\cos(\\theta) = \\frac{\\mathbf{A} \\cdot \\mathbf{B}}{\\|\\mathbf{A}\\| \\|\\mathbf{B}\\|}\$\$  
    (Where A is the User Skill Vector and B is the Job Description Vector).

### **4.4 Data Retention & Metrics**

- **FR-4.1:** The system shall persist **only**: User Name, Phone Number, Email, and Hash of Verification Status.
- **FR-4.2:** A dedicated **Metric Verifier Agent** shall periodically clean this database to ensure valid contact info for future marketing/stats.

## **5\. Non-Functional Requirements (NFRs)**

### **5.1 Performance**

- **Latency:** Resume generation (including RAG research) must complete within **< 300 seconds**. (ample time to deal with all the resource gathering and failures of any sorts, and retrying)
- **Concurrency:** The architecture must support horizontal scaling of Agents (using Kubernetes or Serverless functions) to handle spikes in traffic.

### **5.2 Security**

- **Data Privacy:** Strict adherence to "Privacy by Design." No user documents are written to disk; processing occurs in RAM.
- **Transmission:** All data in transit must be encrypted via TLS 1.3.

### **5.3 Reliability**

- **Fallback:** If the **Market Scout Agent** fails to reach live job boards, it must fall back to a cached dataset of "Last known top jobs" (updated hourly).

## **6\. Interface Requirements**

### **6.1 Model Context Protocol (MCP) Definition**

The system interfaces with tools via standard MCP definitions:

- read_resource:// for parsing user uploads.
- call_tool://verify_cert for the verification agent.
- call_tool://search_market for the market research agent.

### **6.2 User Interface (UI)**

- **Design:** Minimalist, artistic, with good animations, two-tab layout (Expertise Mode / Market Mode).
- **Feedback:** Real-time "Agent Status" indicators (e.g., "Verifying Certificate...", "Scanning Market...", "Drafting...").

---

## **7. Prototype Implementation Notes (This Repository)**

This repository currently contains a **frontend-only Vite + React prototype** located under `app/`. It models the SRS workflows and constraints using **client-side memory** and Gemini API calls.

### **7.1 What Is Implemented (Prototype-Level)**

- **SRS UI:** Two-mode UI is implemented as **Expertise Mode / Market Mode** with real-time agent status indicators.
- **FR-1.1 (Multi-modal input):** Prototype supports text input and basic upload ingestion (PDF/JPG/PNG/TXT) via client-side file reading + Gemini OCR summarization.
- **FR-1.2 (Immediate credential verification):** Prototype triggers verification immediately upon upload; if verification fails, user must **correct** or **override with disclaimer**.
- **FR-1.5 (One-click download):** Prototype provides a one-click download of generated output as a `.md` file.
- **FR-1.6 (Ephemeral session):** Prototype purges session data (in-memory) on **timeout** and on **tab close**.
- **FR-2.1–FR-2.4 (Market workflow):** Prototype supports scanning for jobs, selecting a job, performing a gap analysis, prompting for missing skills (dynamic interview), and synthesizing output after gap-fill.
- **FR-3.1–FR-3.2 (Vector matching):** Prototype uses deterministic client-side embeddings + cosine similarity as a stand-in for vector DB embeddings.
- **NFR 5.3 (Market fallback):** Prototype falls back to an in-memory cached result and then a small built-in fallback job list if live market scan fails.

### **7.2 What Is Not Implemented (Requires Backend / Infra)**

The SRS describes a full **MCP-compliant multi-agent backend** (orchestrator + agents) and strict server-side privacy constraints. This prototype does **not** implement:

- **MCP hub-and-spoke orchestration** (Orchestrator Agent / LangGraph routing).
- **True credential verification** against issuer databases (Verifier Agent is LLM-based plausibility checking only).
- **Server-side “zero-retention” guarantees** with RAM-only processing, TLS termination, and infrastructure controls.
- **Persistent metadata storage (FR-4.1/FR-4.2):** Prototype collects name/email/phone in the UI but does not persist to PostgreSQL or run a scheduled “Metric Verifier Agent.”
- **Hard latency enforcement** for < 300s end-to-end beyond normal UI behavior.

### **7.3 Data Handling Clarification (Prototype)**

- The prototype is designed to avoid long-term storage in the app itself; however, **any third-party API calls (Gemini, Search tool)** may have their own retention policies outside this repo’s control.


here are the api keys repo use and maintain code accordingly
https://github.com/public-apis/public-apis
