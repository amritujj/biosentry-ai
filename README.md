# BioSentry AI — Clinical Evidence & Multi-Turn Ayurvedic Workspace

[![Live Demo](https://img.shields.io/badge/Live_Workspace-GitHub_Pages-brightgreen)](https://amritujj.github.io/biosentry-ai/)
[![Direct Tunnel](https://img.shields.io/badge/Live_Backend-Cloudflare_Tunnel-blue)](https://bench-initiatives-arthur-exams.trycloudflare.com/chat)
[![Status](https://img.shields.io/badge/Engine-Online_200_OK-success)](#)

BioSentry AI is an interactive, multi-turn clinical Ayurveda and health evidence educational platform. It features multi-dimensional intake prompts, 15+ classical disease domains (Charaka, Sushruta, Ashtanga Hridaya), pharmacokinetic drug-herb interaction simulation (TPSM), deterministic lab calculators (CKD-EPI, Cockcroft-Gault), and grounded academic synthesis via Groq cloud models (`openai/gpt-oss-120b`).

---

## 🚀 Presenter & Public Live Access Links

- **Main Clinical Workspace (GitHub Pages)**: [https://amritujj.github.io/biosentry-ai/](https://amritujj.github.io/biosentry-ai/)
- **Direct Full-Stack Engine (Cloudflare Tunnel)**: [https://bench-initiatives-arthur-exams.trycloudflare.com/chat](https://bench-initiatives-arthur-exams.trycloudflare.com/chat)
- **Landing Page & Overview**: [https://bench-initiatives-arthur-exams.trycloudflare.com/](https://bench-initiatives-arthur-exams.trycloudflare.com/)
- **Stall Operator Portal**: [https://amritujj.github.io/biosentry-ai/stall-operator.html](https://amritujj.github.io/biosentry-ai/stall-operator.html)
- **Discovery (200 Questions)**: [https://amritujj.github.io/biosentry-ai/discovery.html](https://amritujj.github.io/biosentry-ai/discovery.html)

---

## ✨ Features & Architecture

1. **Multi-Turn Context Memory:** Retains patient symptoms, onset, and duration across multi-turn consultations without resetting intake state.
2. **Multi-Dimensional Clinical Intake:** Comprehensive 3-part triage (onset, physical thermometer vitals, and red-flag warning signs) with structured interactive choice chips.
3. **15+ Classical Ayurvedic Domains:** Universal clinical classification across *Jvara* (fever), *Shiroroga* (headache), *Sandhivata* (joint pain / arthritis), *Amlapitta* (acidity/GERD), *Kasa* (cough), *Atisara* (gut health), *Katisula* (back pain), *Twak Roga* (skin allergies), *Anidra* (insomnia), *Vibandha* (constipation), and more.
4. **TPSM Pharmacokinetics:** Interactive time-projection simulation for drug-herb metabolic interactions (e.g., Warfarin CYP2C9 displacement).
5. **Deterministic Lab Calculators:** Dual CKD-EPI 2021 & Cockcroft-Gault eGFR renal dosing calculators.
6. **Smart API Bridge:** The frontend automatically resolves the live backend tunnel when accessed from any device worldwide.

---

## 🛠 Local Setup & Running

```bash
# Clone the repository
git clone https://github.com/amritujj/biosentry-ai.git
cd biosentry-ai

# Start the web server (serves frontend & backend on port 8765)
python web_server.py
```

*Research & educational prototype only. Qualified clinician review required.*
