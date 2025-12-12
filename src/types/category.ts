export interface Category {
  id: string;
  slug: string;
  name: string;
  parentId?: string | null;
  level: number;
  imageUrl?: string;
  productCount: number;
  path: string[];
  externalKeys?: string[];
  deals?: string[];
  priority?: number;
  seoDescription?: string;
}

export interface CategoryNode {
  category: Category;
  children: CategoryNode[];
}

export type CategoryDealType = "FLASH_SALE" | "MULTI_BUY_DISCOUNT";

export interface CategoryDealSummary {
  id: string;
  label: string;
  type: CategoryDealType;
  categoryIds?: string[];
}

export interface CreatorCategoryTreeResponse {
  creatorId: string;
  roots: CategoryNode[];
  hotDeals?: CategoryDealSummary[];
}

