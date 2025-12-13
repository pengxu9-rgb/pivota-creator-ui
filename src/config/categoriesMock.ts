import type {
  CategoryNode,
  CreatorCategoryTreeResponse,
  CategoryDealSummary,
} from "@/types/category";

const ROOT_SPORTSWEAR_ID = "sportswear";
const ROOT_LINGERIE_ID = "lingerie-set";
const ROOT_TOYS_ID = "toys";
const ROOT_LOUNGEWEAR_ID = "womens-loungewear";

const MOCK_DEALS: CategoryDealSummary[] = [];

export const MOCK_CREATOR_CATEGORY_TREE: CreatorCategoryTreeResponse = {
  creatorId: "nina-studio",
  roots: [
    {
      category: {
        id: ROOT_SPORTSWEAR_ID,
        slug: "sportswear",
        name: "Sportswear",
        parentId: null,
        level: 0,
        imageUrl: "/mock-categories/sportswear.svg",
        productCount: 128,
        path: ["Sportswear"],
        priority: 30,
      },
      children: [],
    },
    {
      category: {
        id: ROOT_LINGERIE_ID,
        slug: "lingerie-set",
        name: "Lingerie Set",
        parentId: null,
        level: 0,
        imageUrl: "/mock-categories/lingerie-set.svg",
        productCount: 74,
        path: ["Lingerie Set"],
        priority: 25,
      },
      children: [],
    },
    {
      category: {
        id: ROOT_TOYS_ID,
        slug: "toys",
        name: "Toys",
        parentId: null,
        level: 0,
        imageUrl: "/mock-categories/toys.svg",
        productCount: 52,
        path: ["Toys"],
        priority: 20,
      },
      children: [],
    },
    {
      category: {
        id: ROOT_LOUNGEWEAR_ID,
        slug: "womens-loungewear",
        name: "Women’s Loungewear",
        parentId: null,
        level: 0,
        imageUrl: "/mock-categories/womens-loungewear.svg",
        productCount: 61,
        path: ["Women’s Loungewear"],
        priority: 12,
      },
      children: [],
    },
  ],
  hotDeals: MOCK_DEALS,
};

export function getMockCreatorCategoryTree(
  creatorSlug: string,
): CreatorCategoryTreeResponse {
  return {
    ...MOCK_CREATOR_CATEGORY_TREE,
    creatorId: creatorSlug,
  };
}
