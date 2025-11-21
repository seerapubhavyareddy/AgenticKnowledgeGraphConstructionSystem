/**
 * Entity Extraction Agent
 * 
 * Extracts concepts, methods, techniques, datasets, and metrics from research papers
 * using Claude AI with structured prompting.
 */

import Anthropic from '@anthropic-ai/sdk';
import { AgentConfig, ExtractedEntity, ConceptType } from '../types';

interface EntityExtractionResponse {
    entities: ExtractedEntity[];
    total_found: number;
}

export class EntityExtractionAgent {
    private client: Anthropic;
    private config: AgentConfig;

    constructor(config: AgentConfig) {
        this.config = config;
        this.client = new Anthropic({
            apiKey: config.anthropicApiKey,
        });
    }

    /**
     * Extract entities from a research paper
     */
    async extractEntities(
        paperTitle: string,
        paperAbstract: string | null,
        paperFullText: string | null
    ): Promise<ExtractedEntity[]> {

        // Prepare the paper content (prioritize full text, fallback to abstract)
        const paperContent = paperFullText || paperAbstract || '';

        if (!paperContent.trim()) {
            console.warn('⚠️  No content available for extraction');
            return [];
        }

        // Truncate content if too long (Claude has token limits)
        const maxChars = 80000; // ~20k tokens
        const truncatedContent = paperContent.slice(0, maxChars);

        console.log(`📝 Extracting entities from paper: "${paperTitle}"`);
        console.log(`   Content length: ${paperContent.length} chars (using ${truncatedContent.length})`);

        try {
            const response = await this.client.messages.create({
                model: this.config.modelName,
                max_tokens: this.config.maxTokens,
                temperature: this.config.temperature,
                messages: [
                    {
                        role: 'user',
                        content: this.buildExtractionPrompt(paperTitle, truncatedContent)
                    }
                ]
            });

            // Parse the response
            const responseText = response.content[0].type === 'text'
                ? response.content[0].text
                : '';

            const entities = this.parseEntitiesFromResponse(responseText);

            console.log(`✅ Extracted ${entities.length} entities`);

            return entities;

        } catch (error) {
            console.error('❌ Entity extraction failed:', error);
            throw error;
        }
    }

    /**
     * Build the extraction prompt for Claude
     * This is the heart of the agent - the prompt engineering!
     */
    private buildExtractionPrompt(paperTitle: string, paperContent: string): string {
        return `You are an expert research analyst specializing in computer graphics and 3D reconstruction, particularly Gaussian Splatting papers.

Your task is to extract key concepts, methods, techniques, datasets, and metrics from the following research paper.

**Paper Title:** ${paperTitle}

**Paper Content:**
${paperContent}

---

**INSTRUCTIONS:**

Extract entities in the following categories:

1. **method**: Core methods or approaches (e.g., "3D Gaussian Splatting", "NeRF", "Structure from Motion")
2. **technique**: Specific techniques used (e.g., "spherical harmonics", "alpha blending", "tile-based rasterization")
3. **dataset**: Datasets used for evaluation (e.g., "Mip-NeRF 360", "Tanks and Temples", "Deep Blending")
4. **metric**: Performance metrics (e.g., "PSNR", "SSIM", "FPS", "training time")
5. **concept**: General concepts or ideas (e.g., "real-time rendering", "novel view synthesis", "point-based graphics")
6. **architecture**: System architectures or neural network architectures (e.g., "MLP", "encoder-decoder", "U-Net")

For each entity, provide:
- **name**: Clear, concise name (2-5 words max)
- **type**: One of the categories above
- **description**: Brief 1-sentence description
- **relevance_score**: 0.0-1.0 (how central is this to the paper?)
  - 1.0 = Core contribution of the paper
  - 0.7-0.9 = Important technique/method used
  - 0.5-0.6 = Secondary concept mentioned
  - <0.5 = Brief mention
- **context_snippet**: Short quote or paraphrase showing where this appears (max 150 chars)

**CRITICAL RULES:**
- Extract 10-30 entities (focus on quality over quantity)
- Avoid generic terms like "paper", "research", "method" without specifics
- Use standardized names (e.g., "NeRF" not "neural radiance field NeRF")
- Don't include author names or paper citations as entities
- Focus on technical content, not meta-discussion

**OUTPUT FORMAT:**

Return your response as a JSON array. Here's the exact format:

\`\`\`json
{
  "entities": [
    {
      "name": "3D Gaussian Splatting",
      "type": "method",
      "description": "Point-based rendering method using 3D Gaussians for real-time novel view synthesis",
      "relevance_score": 1.0,
      "context_snippet": "We introduce 3D Gaussian Splatting, a method that achieves state-of-the-art visual quality while maintaining real-time rendering speeds"
    },
    {
      "name": "PSNR",
      "type": "metric",
      "description": "Peak Signal-to-Noise Ratio, measures image reconstruction quality",
      "relevance_score": 0.6,
      "context_snippet": "Our method achieves 32.5 PSNR on the Mip-NeRF 360 dataset"
    }
  ],
  "total_found": 2
}
\`\`\`

**IMPORTANT:** 
- Return ONLY valid JSON, no other text before or after
- Ensure all strings are properly escaped
- Double-check that relevance_score is between 0.0 and 1.0

Begin extraction now:`;
    }

    /**
     * Parse entities from Claude's JSON response
     */
    private parseEntitiesFromResponse(responseText: string): ExtractedEntity[] {
        try {
            // Remove markdown code blocks if present
            let jsonText = responseText.trim();

            // Remove ```json and ``` if present
            jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '');

            // Parse JSON
            const parsed = JSON.parse(jsonText) as EntityExtractionResponse;

            // Validate and clean entities
            const entities = parsed.entities
                .filter(e => this.isValidEntity(e))
                .map(e => this.cleanEntity(e));

            return entities;

        } catch (error) {
            console.error('❌ Failed to parse entity response:', error);
            console.error('Response text:', responseText.slice(0, 500));

            // Return empty array rather than crashing
            return [];
        }
    }

    /**
     * Validate an entity has all required fields
     */
    private isValidEntity(entity: any): entity is ExtractedEntity {
        return (
            typeof entity.name === 'string' &&
            typeof entity.type === 'string' &&
            typeof entity.description === 'string' &&
            typeof entity.relevance_score === 'number' &&
            typeof entity.context_snippet === 'string' &&
            entity.relevance_score >= 0 &&
            entity.relevance_score <= 1
        );
    }

    /**
     * Clean and normalize an entity
     */
    private cleanEntity(entity: ExtractedEntity): ExtractedEntity {
        return {
            name: entity.name.trim().slice(0, 255), // Limit to DB varchar(255)
            type: this.normalizeConceptType(entity.type),
            description: entity.description.trim(),
            relevance_score: Math.max(0, Math.min(1, entity.relevance_score)), // Clamp 0-1
            context_snippet: entity.context_snippet.trim().slice(0, 500)
        };
    }

    /**
     * Normalize concept type to match our enum
     */
    private normalizeConceptType(type: string): ConceptType {
        const normalized = type.toLowerCase();

        const validTypes: ConceptType[] = [
            'method',
            'technique',
            'dataset',
            'metric',
            'concept',
            'architecture',
            'algorithm'
        ];

        if (validTypes.includes(normalized as ConceptType)) {
            return normalized as ConceptType;
        }

        // Default fallback
        return 'concept';
    }
}