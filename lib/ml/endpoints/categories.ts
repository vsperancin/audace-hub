/**
 * Categories endpoint — `/categories/{id}` and listing helpers.
 *
 * @module @/lib/ml/endpoints/categories
 */

import type { MercadoLivreClient } from '../client';
import type { MLCategory, MLCategoryPrediction } from '../types';

/** Top-level category summary (used in dropdowns, filters, etc). */
export interface MLCategorySummary {
  readonly id: string;
  readonly name: string;
}

/**
 * Categories endpoint wrapper.
 */
export class CategoriesEndpoint {
  constructor(private readonly client: MercadoLivreClient) {}

  /**
   * Fetch a category with full attribute groups and settings.
   */
  public async get(categoryId: string): Promise<MLCategory> {
    return this.client.get<MLCategory>(`/categories/${categoryId}`);
  }

  /**
   * Predict the best category for a given title + attributes using
   * ML's `/categories/{id}/predict` endpoint.
   *
   * Note: ML's predict endpoint lives under a specific parent
   * category id; if you don't know the parent, use
   * {@link predictByTitle} which starts from the site root.
   */
  public async predict(
    categoryId: string,
    body: { title: string; attributes?: Record<string, string | number> }
  ): Promise<MLCategoryPrediction> {
    return this.client.post<MLCategoryPrediction>(
      `/categories/${categoryId}/predict`,
      body
    );
  }

  /**
   * Predict category by walking the tree starting from MLB root.
   *
   * Useful for new listings where the seller has no idea which
   * category to use.
   */
  public async predictByTitle(
    siteId: string,
    title: string
  ): Promise<MLCategoryPrediction | null> {
    // ML exposes a `predict` at the root site level too.
    try {
      const response = await this.client.get<MLCategoryPrediction>(
        `/sites/${siteId}/category_predictor/predict`,
        { title }
      );
      return response;
    } catch (err) {
      // 404 is expected when no confident prediction — return null.
      if (
        err &&
        typeof err === 'object' &&
        'status' in err &&
        (err as { status?: number }).status === 404
      ) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Fetch the immediate child categories of a category.
   *
   * Useful for category-picker UIs.
   */
  public async children(
    categoryId: string
  ): Promise<MLCategorySummary[]> {
    const category = await this.get(categoryId);
    return (category.children_categories ?? []).map((c) => ({
      id: c.id,
      name: c.name,
    }));
  }

  /**
   * Walk from the category back to the root, returning the full path.
   */
  public async pathFromRoot(
    categoryId: string
  ): Promise<MLCategorySummary[]> {
    const category = await this.get(categoryId);
    return (category.path_from_root ?? []).map((c) => ({
      id: c.id,
      name: c.name,
    }));
  }
}