/**
 * Questions endpoint — `/questions/{id}`, `/questions/search`,
 * `/items/{id}/questions`.
 *
 * @module @/lib/ml/endpoints/questions
 */

import type { MercadoLivreClient } from '../client';
import type {
  MLQuestion,
  MLQuestionSearchFilters,
  MLSearchResponse,
} from '../types';

/** Question search response envelope. */
export type MLQuestionSearchResponse = MLSearchResponse<MLQuestion>;

/**
 * Questions endpoint wrapper.
 */
export class QuestionsEndpoint {
  constructor(private readonly client: MercadoLivreClient) {}

  /**
   * Fetch a single question by id.
   */
  public async get(questionId: number): Promise<MLQuestion> {
    return this.client.get<MLQuestion>(`/questions/${questionId}`);
  }

  /**
   * List questions posted on a specific item.
   */
  public async listByItem(
    itemId: string,
    filters: { status?: 'UNANSWERED' | 'ANSWERED' | 'all'; limit?: number; offset?: number } = {}
  ): Promise<MLQuestionSearchResponse> {
    return this.client.get<MLQuestionSearchResponse>(`/items/${itemId}/questions`, {
      status: filters.status,
      limit: filters.limit ?? 50,
      offset: filters.offset ?? 0,
    });
  }

  /**
   * Search questions with full filter support.
   *
   * Pass at least one of `seller_id`, `item_id`, or `status` —
   * otherwise ML rejects the call with 400.
   */
  public async search(
    filters: MLQuestionSearchFilters = {}
  ): Promise<MLQuestionSearchResponse> {
    const params: Record<string, string | number> = {
      limit: filters.limit ?? 50,
      offset: filters.offset ?? 0,
    };
    if (filters.seller_id !== undefined) params.seller_id = filters.seller_id;
    if (filters.item_id !== undefined) params.item_id = filters.item_id;
    if (filters.status !== undefined) params.status = filters.status;
    if (filters.from) {
      params.from = filters.from instanceof Date ? filters.from.toISOString() : filters.from;
    }
    if (filters.to) {
      params.to = filters.to instanceof Date ? filters.to.toISOString() : filters.to;
    }

    return this.client.get<MLQuestionSearchResponse>('/questions/search', params);
  }

  /**
   * Convenience: fetch all UNANSWERED questions for a seller, auto-paginated.
   */
  public async unansweredForSeller(
    sellerId: number,
    options: { maxItems?: number; pageSize?: number } = {}
  ): Promise<MLQuestion[]> {
    return this.client.withPagination<MLQuestionSearchResponse, MLQuestion>(
      async ({ offset, limit }) => {
        return this.search({
          seller_id: sellerId,
          status: 'UNANSWERED',
          offset,
          limit,
        });
      },
      { maxItems: options.maxItems, pageSize: options.pageSize }
    );
  }

  /**
   * Post an answer to a question.
   */
  public async answer(questionId: number, text: string): Promise<MLQuestion> {
    return this.client.post<MLQuestion>(`/questions/${questionId}/answer`, {
      text,
    });
  }

  /**
   * Delete a question (only the buyer who asked can delete).
   */
  public async delete(questionId: number): Promise<void> {
    await this.client.delete<void>(`/questions/${questionId}`);
  }
}