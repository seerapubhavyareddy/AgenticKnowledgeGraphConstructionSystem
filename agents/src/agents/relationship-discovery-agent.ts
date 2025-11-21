/**
 * Relationship Discovery Agent (Agent #2)
 * 
 * Discovers semantic relationships between papers by analyzing:
 * - Paper abstracts
 * - Extracted concepts from Agent #1
 * - Concept overlap between papers
 * 
 * Focuses on comparing papers to the seminal paper (2308.04079)
 */

import Anthropic from '@anthropic-ai/sdk';
import { AgentConfig, RelationshipType, PaperRow, ConceptRow } from '../types';

interface SharedConceptWithRelevance extends ConceptRow {
    paper1_relevance: number;
    paper2_relevance: number;
    avg_relevance: number;
}

interface RelationshipExtractionResponse {
    relationship_type: RelationshipType | null;
    explanation: string;
    confidence: number;
    supporting_evidence: string;
}

export class RelationshipDiscoveryAgent {
    private client: Anthropic;
    private config: AgentConfig;

    constructor(config: AgentConfig) {
        this.config = config;
        this.client = new Anthropic({
            apiKey: config.anthropicApiKey,
        });
    }

    /**
     * Calculate base confidence from concept overlap
     * Uses weighted scoring based on relevance scores
     */
    calculateBaseConfidence(sharedConcepts: SharedConceptWithRelevance[]): number {
        if (sharedConcepts.length === 0) {
            return 0.3; // Minimum confidence when no shared concepts
        }

        // Weight concepts by their average relevance
        const highRelevance = sharedConcepts.filter(c => c.avg_relevance >= 0.7);
        const mediumRelevance = sharedConcepts.filter(c => c.avg_relevance >= 0.5 && c.avg_relevance < 0.7);
        const lowRelevance = sharedConcepts.filter(c => c.avg_relevance >= 0.4 && c.avg_relevance < 0.5);

        // Calculate weighted score
        const score = (highRelevance.length * 0.15) +
            (mediumRelevance.length * 0.08) +
            (lowRelevance.length * 0.04);

        // Clamp between 0.3 and 0.85 (leave room for LLM adjustment)
        return Math.min(0.85, Math.max(0.3, score));
    }

    /**
     * Discover relationship between two papers
     */
    async discoverRelationship(
        sourcePaper: PaperRow,
        targetPaper: PaperRow,
        sourceConcepts: ConceptRow[],
        targetConcepts: ConceptRow[],
        sharedConcepts: SharedConceptWithRelevance[]
    ): Promise<RelationshipExtractionResponse | null> {

        // Calculate base confidence from concept overlap
        const baseConfidence = this.calculateBaseConfidence(sharedConcepts);

        console.log(`🔍 Analyzing relationship: "${sourcePaper.title}"`);
        console.log(`   → Target: "${targetPaper.title}"`);
        console.log(`   Shared concepts: ${sharedConcepts.length}`);
        console.log(`   Base confidence: ${baseConfidence.toFixed(2)}`);

        try {
            const response = await this.client.messages.create({
                model: this.config.modelName,
                max_tokens: this.config.maxTokens,
                temperature: this.config.temperature,
                messages: [
                    {
                        role: 'user',
                        content: this.buildRelationshipPrompt(
                            sourcePaper,
                            targetPaper,
                            sourceConcepts,
                            targetConcepts,
                            sharedConcepts,
                            baseConfidence
                        )
                    }
                ]
            });

            // Parse the response
            const responseText = response.content[0].type === 'text'
                ? response.content[0].text
                : '';

            const relationship = this.parseRelationshipFromResponse(responseText);

            if (relationship) {
                console.log(`   ✅ Found: ${relationship.relationship_type || 'null'} (confidence: ${relationship.confidence.toFixed(2)})`);
            } else {
                console.log(`   ⚠️  No valid relationship extracted`);
            }

            return relationship;

        } catch (error) {
            console.error('   ❌ Relationship discovery failed:', error);
            throw error;
        }
    }

    /**
     * Build the relationship discovery prompt for Claude
     */
    private buildRelationshipPrompt(
        sourcePaper: PaperRow,
        targetPaper: PaperRow,
        sourceConcepts: ConceptRow[],
        targetConcepts: ConceptRow[],
        sharedConcepts: SharedConceptWithRelevance[],
        baseConfidence: number
    ): string {
        // Format concepts for display
        const formatConcepts = (concepts: ConceptRow[], limit: number = 10) => {
            return concepts
                .slice(0, limit)
                .map(c => `• ${c.name} (${c.concept_type})`)
                .join('\n');
        };

        const formatSharedConcepts = (concepts: SharedConceptWithRelevance[]) => {
            return concepts
                .map(c => `• ${c.name} (${c.concept_type}) - avg relevance: ${c.avg_relevance.toFixed(2)}`)
                .join('\n');
        };

        return `You are a research paper analyst specializing in computer graphics and 3D reconstruction, particularly Gaussian Splatting.

Your task is to identify the semantic relationship between two research papers.

=============================================================================
TARGET PAPER (Seminal):
=============================================================================
Title: ${targetPaper.title}
ArXiv ID: ${targetPaper.arxiv_id}

Abstract:
${targetPaper.abstract || 'No abstract available'}

Key Concepts (${targetConcepts.length} total):
${formatConcepts(targetConcepts, 10)}

=============================================================================
SOURCE PAPER:
=============================================================================
Title: ${sourcePaper.title}
ArXiv ID: ${sourcePaper.arxiv_id}

Abstract:
${sourcePaper.abstract || 'No abstract available'}

Key Concepts (${sourceConcepts.length} total):
${formatConcepts(sourceConcepts, 10)}

=============================================================================
SHARED CONCEPTS (${sharedConcepts.length} total):
=============================================================================
${sharedConcepts.length > 0 ? formatSharedConcepts(sharedConcepts) : 'No shared concepts with relevance >= 0.4'}

=============================================================================
BASE CONFIDENCE FROM CONCEPT OVERLAP: ${baseConfidence.toFixed(2)}
=============================================================================

---

TASK: Determine if and how the SOURCE paper relates to the TARGET (seminal) paper.

RELATIONSHIP TYPES (choose ONE or null):

1. **improves_on**: SOURCE improves TARGET's method, performance, or results
   - Example: "achieves 40% faster rendering than [TARGET]"
   - Example: "reduces memory usage compared to [TARGET]"

2. **extends**: SOURCE adds new capabilities or features to TARGET's approach
   - Example: "extends [TARGET] to handle dynamic scenes"
   - Example: "generalizes [TARGET] to work with multiple cameras"

3. **evaluates**: SOURCE evaluates, benchmarks, or compares against TARGET
   - Example: "we compare our method against [TARGET]"
   - Example: "benchmark results show improvements over [TARGET]"

4. **builds_on**: SOURCE uses TARGET as a foundation or starting point
   - Example: "building on the work of [TARGET]"
   - Example: "we adopt the Gaussian representation from [TARGET]"

5. **addresses**: SOURCE addresses limitations or problems in TARGET
   - Example: "addresses the artifacts present in [TARGET]"
   - Example: "solves the memory bottleneck of [TARGET]"

6. **cites**: SOURCE mentions TARGET but without strong semantic connection
   - Example: "related work includes [TARGET] among others"
   - Use this for weak citations or passing mentions

7. **null**: No meaningful relationship found
   - Use this if papers are unrelated or connection is too weak

---

CONFIDENCE SCORING:

Adjust the base confidence (${baseConfidence.toFixed(2)}) based on:

**HIGH CONFIDENCE (0.8-1.0):**
- SOURCE explicitly mentions TARGET in abstract
- Specific improvements/extensions mentioned (e.g., "40% faster", "reduces artifacts")
- Strong shared concepts with clear connection
- Multiple pieces of supporting evidence

**MEDIUM CONFIDENCE (0.5-0.7):**
- SOURCE implicitly references TARGET's work
- Moderate shared concepts
- General improvements mentioned without specifics
- Some supporting evidence

**LOW CONFIDENCE (0.2-0.4):**
- Only inferred from shared concepts
- No explicit mention in abstract
- Weak or indirect evidence
- Very general connection

**VERY LOW (0.0-0.2):**
- Speculative connection
- Minimal shared concepts
- No clear relationship

---

OUTPUT FORMAT:

Return ONLY a valid JSON object with this exact structure:

\`\`\`json
{
  "relationship_type": "improves_on",
  "explanation": "The source paper improves upon the target's rendering speed by introducing a novel tile-based rasterization technique, achieving 40% faster performance while maintaining visual quality. The paper explicitly compares against the seminal 3D Gaussian Splatting method.",
  "confidence": 0.85,
  "supporting_evidence": "We achieve real-time rendering at 120 FPS compared to the 85 FPS of the original 3D Gaussian Splatting method."
}
\`\`\`

**CRITICAL RULES:**
1. Return ONLY valid JSON, no other text before or after
2. relationship_type must be one of: "improves_on", "extends", "evaluates", "builds_on", "addresses", "cites", or null
3. explanation must be 2-3 sentences with specific details
4. confidence must be a number between 0.0 and 1.0
5. supporting_evidence should be a direct quote from the SOURCE abstract (if available), or "Not explicitly stated in abstract" if inferred
6. If no meaningful relationship exists, use relationship_type: null with low confidence

Begin analysis now:`;
    }

    /**
     * Parse relationship from Claude's JSON response
     */
    private parseRelationshipFromResponse(responseText: string): RelationshipExtractionResponse | null {
        try {
            // Remove markdown code blocks if present
            let jsonText = responseText.trim();
            jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '');

            // Parse JSON
            const parsed = JSON.parse(jsonText) as RelationshipExtractionResponse;

            // Validate required fields
            if (!this.isValidRelationship(parsed)) {
                console.error('   ⚠️  Invalid relationship structure');
                return null;
            }

            // Clean and normalize
            return this.cleanRelationship(parsed);

        } catch (error) {
            console.error('   ❌ Failed to parse relationship response:', error);
            console.error('   Response text:', responseText.slice(0, 500));
            return null;
        }
    }

    /**
     * Validate relationship structure
     */
    private isValidRelationship(rel: any): rel is RelationshipExtractionResponse {
        // relationship_type can be null or a valid type
        const validTypes: Array<RelationshipType | null> = [
            'improves_on',
            'extends',
            'evaluates',
            'builds_on',
            'addresses',
            'cites',
            null
        ];

        return (
            (rel.relationship_type === null || validTypes.includes(rel.relationship_type)) &&
            typeof rel.explanation === 'string' &&
            typeof rel.confidence === 'number' &&
            typeof rel.supporting_evidence === 'string' &&
            rel.confidence >= 0 &&
            rel.confidence <= 1
        );
    }

    /**
     * Clean and normalize relationship
     */
    private cleanRelationship(rel: RelationshipExtractionResponse): RelationshipExtractionResponse {
        return {
            relationship_type: rel.relationship_type,
            explanation: rel.explanation.trim(),
            confidence: Math.max(0, Math.min(1, rel.confidence)), // Clamp 0-1
            supporting_evidence: rel.supporting_evidence.trim()
        };
    }
}