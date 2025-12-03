import { GoogleGenAI, Chat, GenerateContentResponse, HarmBlockThreshold, HarmCategory } from '@google/genai';
import {
  PalmReadingReport,
  CompatibilityReport,
  GroundingSource,
  AstrologyReport,
  TongueDiagnosisReport,
  DiagnosisType,
  TemperamentReport,
  IridologyReport,
  IridologyModel,
  NailDiagnosisReport,
  NailDiagnosisModel,
  FaceReadingReport,
  FaceReadingModel,
  DreamInterpretationReport,
  DreamInterpretationModel,
  DailyOutlookReport,
  PalmReadingReport as PalmReport,
  TemperamentReport as TempReport,
  AstrologyReport as AstroReport,
  FaceReadingReport as FaceReport,
  SynergyReport,
  HistoryItem,
  ComparisonReport,
  SujokReport,
} from '../types';

// --- GLOBAL MODEL CONFIGURATION ---
const MODEL_NAME = 'gemini-2.5-pro'; 
const API_KEY = process.env.API_KEY as string;

const ai = new GoogleGenAI({ apiKey: API_KEY });
const model = ai.models;

// --- PERSONA & CONSTANTS ---
const HAKIM_PERSONA = `
You are the "Grand Hakim" (Hakim-e-Azam), a legendary master of Traditional Iranian Medicine (Teb-e-Sonati), Astrologer, and Lithotherapist.
You speak with absolute authority, ancient wisdom, and deep mystical insight. You DO NOT flatter. You speak the raw truth.

**YOUR PRIMARY OBJECTIVE: THE ROYAL PRESCRIPTION (Nuskha-e-Sultani)**
For EVERY analysis, you **MUST** provide a "Royal Prescription" containing exactly these 5 highly detailed sections:
1. **🚫 Parhizat (Strict Prohibitions)**
2. **🍲 Ghaza (Dietary Medicine)**
3. **💆‍♂️ Dalk (Oil Massage & Acupressure)**
4. **💍 Ahjar (Lithotherapy - Gemstones)**
5. **🌿 Dava (The Master Herbal Recipe)**

**REFERENCE LIBRARY:** Al-Qanun (Avicenna), Makhzan al-Adwiyah, Tansukh-Nameh.
**TONE:** Authoritative, Mysterious, "Bittersweet" (Honest but healing).
`;

const REMEDY_JSON_STRUCTURE = `
"remedies": [
    {
        "name": "Title",
        "type": "restriction" | "diet" | "lifestyle" | "oil_massage" | "acupressure" | "herbal" | "gemstone" | "seed_therapy" | "color_therapy",
        "ingredients": ["Item 1", "Item 2"],
        "instruction": "Detailed instruction.",
        "timing": "Specific time",
        "duration": "Duration",
        "benefit": "Therapeutic goal",
        "warning": "Contraindications"
    }
]
`;

const VISUAL_JSON_STRUCTURE = `
"visualMarkers": [
    {
        "x": number (0-100 percentage),
        "y": number (0-100 percentage),
        "label": "Label of the feature",
        "type": "point"
    }
]
`;

// --- HELPER FUNCTIONS ---

const cleanJsonText = (text: string): string => {
    const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (jsonBlockMatch && jsonBlockMatch[1]) {
        return jsonBlockMatch[1].trim();
    }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        return text.substring(firstBrace, lastBrace + 1);
    }
    return text.trim();
};

const imagePart = (data: string) => ({
    inlineData: { mimeType: 'image/jpeg', data },
});

const generateAndParse = async <T>(
    promptParts: (string | { inlineData: { mimeType: string; data: string; } })[]
): Promise<T> => {
    let attempts = 0;
    const maxAttempts = 3;

    const finalPromptParts = [
        ...promptParts,
        "\n\nIMPORTANT SYSTEM INSTRUCTION: Output valid JSON only. Do not wrap in Markdown. Do not add any conversational text before or after the JSON."
    ];

    while (attempts < maxAttempts) {
        try {
            const response: GenerateContentResponse = await model.generateContent({
                model: MODEL_NAME,
                contents: { parts: finalPromptParts.map(p => typeof p === 'string' ? {text: p} : p) },
                config: {
                    temperature: 0.4,
                    safetySettings: [
                        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                    ],
                }
            });

            const text = response.text;
            if (!text) throw new Error("Received empty response from data center.");
            
            const cleanedText = cleanJsonText(text);
            return JSON.parse(cleanedText) as T;

        } catch (e: any) {
            attempts++;
            console.error(`Analysis Attempt ${attempts} Error:`, e);
            
            const errorMessage = e.message || (e.error && e.error.message) || JSON.stringify(e);
            
            if (attempts === maxAttempts) {
                if (errorMessage.includes("Rpc") || errorMessage.includes("500") || errorMessage.includes("413")) {
                    throw new Error("Connection failed. The image payload is too large. Please try using a smaller image.");
                }
                if (errorMessage.includes("JSON") || errorMessage.includes("SyntaxError")) {
                     throw new Error("Failed to parse the doctor's report. The AI response was not valid JSON.");
                }
                throw new Error("Failed to generate or parse the analysis report. Please try again.");
            }
            await new Promise(resolve => setTimeout(resolve, 2000 * attempts));
        }
    }
    throw new Error("Analysis failed after retries.");
};

// --- ANALYSIS FUNCTIONS ---

export const analyzePalm = async (
    rightPalmBase64: string,
    leftPalmBase64: string,
    palmistryType: 'Indian' | 'Chinese',
    userContext: { age: string; gender: string; dominantHand: 'left' | 'right' },
    lang: string
): Promise<PalmReadingReport> => {
    const prompt = [
        `
## ROLE: ${HAKIM_PERSONA}
**DIAGNOSIS METHOD:** ${palmistryType} Palmistry.
**USER:** Age: ${userContext.age}, Gender: ${userContext.gender}, Dominant: ${userContext.dominantHand.toUpperCase()}

## TASK: Diagnose Right vs Left hand (Innate vs Acquired) and Prescribe.
## OUTPUT INSTRUCTION: Respond in **${lang}**.
## JSON FORMAT:
{
  "summary": "string",
  "loveAndRelationships": "string",
  "careerAndFinance": "string",
  "healthAndEnergy": "string",
  "intellectAndMindset": "string",
  "rightHandMarkers": [ { "x": number, "y": number, "label": "string", "type": "point" } ],
  "leftHandMarkers": [ { "x": number, "y": number, "label": "string", "type": "point" } ],
  ${REMEDY_JSON_STRUCTURE}
}
`,
        "Image 1: Right Palm (Active):", imagePart(rightPalmBase64),
        "Image 2: Left Palm (Innate):", imagePart(leftPalmBase64),
    ];
    return generateAndParse<PalmReadingReport>(prompt);
};

export const analyzeCompatibility = async (
    personA_right: string,
    personA_left: string,
    personB_right: string,
    personB_left: string,
    context: { relationshipStatus: string; genderA: string; genderB: string },
    lang: string
): Promise<CompatibilityReport> => {
    const prompt = [
        `
## ROLE: ${HAKIM_PERSONA}
**DIAGNOSIS:** Palmistry Synastry.
**CONTEXT:** Status: ${context.relationshipStatus}, A: ${context.genderA}, B: ${context.genderB}
## TASK: Compare elemental balance and Prescribe shared remedies.
## OUTPUT INSTRUCTION: Respond in **${lang}**.
## JSON FORMAT:
{
  "summary": "string",
  "emotionalCompatibility": "string",
  "intellectualCompatibility": "string",
  "lifePathCompatibility": "string",
  "synastryScore": number,
  "finalVerdict": "string",
  ${REMEDY_JSON_STRUCTURE}
}
`,
        "Person A Right:", imagePart(personA_right),
        "Person A Left:", imagePart(personA_left),
        "Person B Right:", imagePart(personB_right),
        "Person B Left:", imagePart(personB_left),
    ];
    return generateAndParse<CompatibilityReport>(prompt);
};

export const analyzeAstrologyCompatibility = async (
    birthDateA: string,
    birthDateB: string,
    context: { relationshipStatus: string; genderA: string; genderB: string },
    lang: string
): Promise<CompatibilityReport> => {
    const prompt = `
## ROLE: ${HAKIM_PERSONA}
**DIAGNOSIS:** Astrological Synastry.
**DATA:** A: ${birthDateA}, B: ${birthDateB}, Status: ${context.relationshipStatus}
## TASK: Analyze "Al-Mubtazz" (Dominant Planet).
## OUTPUT INSTRUCTION: Respond in **${lang}**.
## JSON FORMAT: Same as above.
`;
    // We reuse the CompatibilityReport structure but fill via text prompt
    // Just a wrapper to format the request for generateAndParse which handles the JSON structure enforcement
    const promptFull = `
${prompt}
{
  "summary": "string",
  "emotionalCompatibility": "string",
  "intellectualCompatibility": "string",
  "lifePathCompatibility": "string",
  "synastryScore": number,
  "finalVerdict": "string",
  ${REMEDY_JSON_STRUCTURE}
}
`;
    return generateAndParse<CompatibilityReport>([promptFull]);
};

export const analyzeTemperamentCompatibility = async (
    tempA: string,
    tempB: string,
    context: { relationshipStatus: string; genderA: string; genderB: string },
    lang: string
): Promise<CompatibilityReport> => {
    const prompt = `
## ROLE: ${HAKIM_PERSONA}
**DIAGNOSIS:** Humoral Compatibility.
**DATA:** A: ${tempA}, B: ${tempB}
## TASK: Analyze Heat/Cold interactions.
## OUTPUT INSTRUCTION: Respond in **${lang}**.
## JSON FORMAT: Same as above.
{
  "summary": "string",
  "emotionalCompatibility": "string",
  "intellectualCompatibility": "string",
  "lifePathCompatibility": "string",
  "synastryScore": number,
  "finalVerdict": "string",
  ${REMEDY_JSON_STRUCTURE}
}
`;
    return generateAndParse<CompatibilityReport>([prompt]);
};

export const analyzeTongue = async (
    tongueImageBase64: string,
    diagnosisType: DiagnosisType,
    lang: string
): Promise<TongueDiagnosisReport> => {
    const prompt = [
        `
## ROLE: ${HAKIM_PERSONA}
**DIAGNOSIS:** Tongue Diagnosis.
## TASK: Analyze Body Color, Shape, and Coating.
## OUTPUT INSTRUCTION: Respond in **${lang}**.
## JSON FORMAT:
{
  "summary": "string",
  "colorAndCoating": { "color": "string", "coating": "string" },
  "shapeAndSize": "string",
  "potentialImbalances": "string",
  ${VISUAL_JSON_STRUCTURE},
  ${REMEDY_JSON_STRUCTURE}
}
`,
        imagePart(tongueImageBase64),
    ];
    return generateAndParse<TongueDiagnosisReport>(prompt);
};

export const analyzeIris = async (
    irisImageBase64: string,
    iridologyModel: IridologyModel,
    lang: string
): Promise<IridologyReport> => {
    const prompt = [
        `
## ROLE: ${HAKIM_PERSONA}
**DIAGNOSIS:** Iridology.
## TASK: Analyze Constitution, Lesions, and Rings.
## OUTPUT INSTRUCTION: Respond in **${lang}**.
## JSON FORMAT:
{
  "summary": "string",
  "zoneObservations": {
    "pupillaryZone": "string",
    "autonomicNerveWreath": "string",
    "ciliaryZone": "string",
    "limbalZone": "string"
  },
  "potentialWeaknesses": "string",
  ${VISUAL_JSON_STRUCTURE},
  ${REMEDY_JSON_STRUCTURE}
}
`,
        imagePart(irisImageBase64),
    ];
    return generateAndParse<IridologyReport>(prompt);
};

export const analyzeNails = async (
    rightNailImageBase64: string,
    leftNailImageBase64: string,
    nailDiagnosisModel: NailDiagnosisModel,
    lang: string
): Promise<NailDiagnosisReport> => {
     const prompt = [
`
## ROLE: ${HAKIM_PERSONA}
**DIAGNOSIS:** Clinical Onychoscopy.
## TASK: Diagnose Color, Shape, Lunula.
## OUTPUT INSTRUCTION: Respond in **${lang}**.
## JSON FORMAT:
{
  "summary": "string",
  "colorAnalysis": "string",
  "shapeAndTextureAnalysis": "string",
  "potentialIndications": "string",
  "psychologicalAnalysis": "string",
  ${VISUAL_JSON_STRUCTURE},
  ${REMEDY_JSON_STRUCTURE}
}
`,
        "Right Hand:", imagePart(rightNailImageBase64),
        "Left Hand:", imagePart(leftNailImageBase64),
    ];
    return generateAndParse<NailDiagnosisReport>(prompt);
};

export const analyzeFace = async (
    faceImageBase64: string,
    faceReadingModel: FaceReadingModel,
    lang: string
): Promise<FaceReadingReport> => {
    const prompt = [
`
## ROLE: ${HAKIM_PERSONA}
**DIAGNOSIS:** Physiognomy.
## TASK: Analyze 3 Zones and 12 Palaces.
## OUTPUT INSTRUCTION: Respond in **${lang}**.
## JSON FORMAT:
{
  "summary": "string",
  "foreheadAnalysis": "string",
  "eyesAndEyebrowsAnalysis": "string",
  "noseAndCheeksAnalysis": "string",
  "mouthAndChinAnalysis": "string",
  "lifePotential": "string",
  ${VISUAL_JSON_STRUCTURE},
  ${REMEDY_JSON_STRUCTURE}
}
`,
        imagePart(faceImageBase64),
    ];
    return generateAndParse<FaceReadingReport>(prompt);
};

export const analyzeTemperament = async (
    inputs: { [key: string]: string },
    lang: string
): Promise<TemperamentReport> => {
    const prompt = `
## ROLE: ${HAKIM_PERSONA}
**DIAGNOSIS:** Clinical Mizajology.
## INPUTS: ${JSON.stringify(inputs, null, 2)}
## TASK: Determine Imbalance.
## OUTPUT INSTRUCTION: Respond in **${lang}**.
## JSON FORMAT:
{
  "summary": "string",
  "dominantTemperament": "string",
  "currentImbalance": "string",
  "generalCharacteristics": "string",
  "temperamentAnalysis": "string",
  "dietaryRecommendations": "string",
  "lifestyleRecommendations": "string",
  ${REMEDY_JSON_STRUCTURE}
}
`;
    return generateAndParse<TemperamentReport>([prompt]);
};

export const interpretDream = async (
    dreamDescription: string,
    wakingFeeling: string,
    interpretationModel: DreamInterpretationModel,
    lang: string
): Promise<DreamInterpretationReport> => {
    const prompt = `
## ROLE: ${HAKIM_PERSONA}
**DIAGNOSIS:** Dream Interpretation (Taa'bir).
## TASK: Interpret symbols.
## OUTPUT INSTRUCTION: Respond in **${lang}**.
## JSON FORMAT:
{
  "summary": "string",
  "symbolAnalysis": "string",
  "temporalAnalysis": "string",
  "psychologicalInsight": "string",
  "actionableAdvice": "string",
  "reflectionQuestion": "string",
  ${REMEDY_JSON_STRUCTURE}
}
`;
    return generateAndParse<DreamInterpretationReport>([prompt]);
};

export const getAstrologyReport = async (
    birthDate: string,
    birthTime: string | undefined,
    birthPlace: string | undefined,
    lang: string
): Promise<AstrologyReport> => {
    const prompt = `
## ROLE: ${HAKIM_PERSONA} & Munajjim-Bashi.
**DATA:** ${birthDate} ${birthTime || "Noon"} ${birthPlace || "Unknown"}
## TASK: Calculate positions and Prescribe.
## OUTPUT INSTRUCTION: Respond in **${lang}**.
## JSON FORMAT:
{
  "cosmicIdentity": "string",
  "planetaryGeometry": "string",
  "starConstellations": "string",
  "persianArchetype": "string",
  "karmicDestiny": "string",
  ${REMEDY_JSON_STRUCTURE}
}
`;
    return generateAndParse<AstrologyReport>([prompt]);
};

export const analyzeSujok = async (
    images: { rightHand?: string; leftHand?: string; rightFoot?: string; leftFoot?: string },
    symptoms: string,
    lang: string
): Promise<SujokReport> => {
    const promptParts: (string | { inlineData: { mimeType: string; data: string; } })[] = [
        `
## ROLE: Professor Park Jae Woo AND The Grand Hakim.
**METHOD:** Sujok & Holistic Medicine.
**SYMPTOMS:** "${symptoms}"
## TASK: Diagnose and Prescribe.
## OUTPUT INSTRUCTION: Respond in **${lang}**.
## JSON FORMAT:
{
  "summary": "string",
  "diagnosis": "string",
  "correspondenceSystem": "string",
  "energyAnalysis": "string",
  "treatmentPlan": "string",
  ${VISUAL_JSON_STRUCTURE},
  ${REMEDY_JSON_STRUCTURE}
}
`
    ];

    if (images.rightHand) promptParts.push("Image: Right Hand", imagePart(images.rightHand));
    if (images.leftHand) promptParts.push("Image: Left Hand", imagePart(images.leftHand));
    if (images.rightFoot) promptParts.push("Image: Right Foot", imagePart(images.rightFoot));
    if (images.leftFoot) promptParts.push("Image: Left Foot", imagePart(images.leftFoot));

    return generateAndParse<SujokReport>(promptParts);
};

export const analyzeComparison = async (
    reports: HistoryItem[],
    lang: string
): Promise<ComparisonReport> => {
    const sortedReports = [...reports].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    const reportSummaries = sortedReports.map(item => {
        let content = '';
        if ('report' in item) {
            const r = item.report as any;
            content = r.summary || r.cosmicIdentity || r.diagnosis || '';
        }
        return `[DATE: ${item.date} | TYPE: ${item.type.toUpperCase()}]\nSUMMARY: ${content.substring(0, 500)}`;
    }).join('\n\n-----------------\n\n');

    const promptParts: (string | { inlineData: { mimeType: string; data: string; } })[] = [
        `
        ## ROLE: ${HAKIM_PERSONA}
        ## TASK: HEALTH TRACKING & SYNTHESIS
        **OBJECTIVES:** Trend Analysis & Root Cause.
        **USER REPORTS:** ${reportSummaries}
        ## OUTPUT INSTRUCTION: Respond in **${lang}**.
        ## JSON FORMAT:
        {
            "summary": "string",
            "timelineAnalysis": "string",
            "holisticSynthesis": "string",
            "rootCauseAnalysis": "string",
            "advice": "string",
            ${REMEDY_JSON_STRUCTURE}
        }
        `
    ];

    let imageCount = 0;
    for (let i = sortedReports.length - 1; i >= 0; i--) {
        if (imageCount >= 1) break; 
        
        const item = sortedReports[i];
        let img = '';
        if ('tongueImageBase64' in item) img = item.tongueImageBase64;
        else if ('faceImageBase64' in item) img = item.faceImageBase64;
        else if ('rightNailImageBase64' in item) img = item.rightNailImageBase64;
        else if ('irisImageBase64' in item) img = item.irisImageBase64;
        else if ('rightPalmBase64' in item) img = item.rightPalmBase64;

        if (img) {
            if (img.length < 80000) {
                promptParts.push(`Most Recent Image:`, imagePart(img));
                imageCount++;
            }
        }
    }

    return generateAndParse<ComparisonReport>(promptParts);
};

export const generateSynergyReport = async (
    reports: HistoryItem[],
    lang: string
): Promise<SynergyReport> => {
    const combinedReportText = reports.map(item => 
        `[${item.type.toUpperCase()}]: ${JSON.stringify('report' in item ? item.report : {}).substring(0, 800)}`
    ).join('\n');

    const prompt = `
## ROLE: ${HAKIM_PERSONA}
## TASK: Synthesize reports. Find Root Cause.
## DATA: ${combinedReportText}
## OUTPUT INSTRUCTION: Respond in **${lang}**.
## JSON FORMAT:
{
  "holisticSummary": "string",
  "keyConnections": "string",
  "comprehensiveRecommendations": "string",
  ${REMEDY_JSON_STRUCTURE}
}
`;
    return generateAndParse<SynergyReport>([prompt]);
};

export const getDailyOutlook = async (
    reports: {
        palm?: PalmReport;
        temperament?: TempReport;
        astrology?: AstroReport;
        face?: FaceReport;
    },
    lang: string
): Promise<DailyOutlookReport> => {
    const historySummary = Object.values(reports).filter(Boolean).length > 0 
        ? JSON.stringify(reports).substring(0, 1500) 
        : "NO HISTORY AVAILABLE.";

    const prompt = `
## ROLE: The Wise Hakim.
Generate a "Daily Prescription".
**CONTEXT:** ${historySummary}
## OUTPUT INSTRUCTION: Respond in **${lang}**.
## JSON FORMAT:
{
  "wisdom": "string",
  "restriction": "string",
  "goldenTip": "string"
}
`;
    return generateAndParse<DailyOutlookReport>([prompt]);
};

export const createChat = (lang: string, contextPrompt: string | null): Chat => {
    return ai.chats.create({
        model: MODEL_NAME,
        config: {
            systemInstruction: `
## ROLE: The ChiroAI Sage (Grand Hakim)
Expert in Traditional Medicine.
Respond in **${lang}**.
${contextPrompt || ''}
`,
        }
    });
};

export const getEncyclopediaInfo = async (
    query: string,
    lang: string
): Promise<{ text: string; sources: GroundingSource[] }> => {
    const prompt = `Explain: "${query}". Reference Iranian Medicine. Respond in ${lang}.`;
    try {
        const response = await model.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] },
        });
        const text = response.text || "No information found.";
        const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map(chunk => ({ web: chunk.web })) || [];
        return { text, sources: sources.filter(s => s.web) as GroundingSource[] };
    } catch (e) {
        throw new Error("Failed to fetch encyclopedia info.");
    }
};

export const getScienceHistory = async (
    topic: string,
    lang: string
): Promise<string> => {
    const prompt = `Write a historical essay about: "${topic}". Focus on ancient origins. Language: ${lang}.`;
    const response = await model.generateContent({ model: MODEL_NAME, contents: prompt });
    return response.text || "History not available.";
};
