import type {
  CategoryNode,
  CreatorCategoryTreeResponse,
  CategoryDealSummary,
} from "@/types/category";

const ROOT_BEAUTY_ID = "beauty";
const ROOT_FESTIVAL_ID = "festival";

const MOCK_DEALS: CategoryDealSummary[] = [
  {
    id: "deal-beauty-multi-buy",
    label: "Buy 3 beauty items, get 20% off",
    type: "MULTI_BUY_DISCOUNT",
    categoryIds: ["skin-care", "makeup", "fragrance"],
  },
  {
    id: "deal-festival-flash",
    label: "Festival flash sale",
    type: "FLASH_SALE",
    categoryIds: ["wigs", "temporary-tattoos"],
  },
];

const BEAUTY_CHILDREN: CategoryNode[] = [
  {
    category: {
      id: "skin-care",
      slug: "skin-care",
      name: "Skin Care",
      parentId: ROOT_BEAUTY_ID,
      level: 1,
      imageUrl: "/mock-categories/skin-care.jpg",
      productCount: 24,
      path: ["Beauty", "Skin Care"],
      deals: ["deal-beauty-multi-buy"],
    },
    children: [],
  },
  {
    category: {
      id: "hair-care",
      slug: "hair-care",
      name: "Hair Care",
      parentId: ROOT_BEAUTY_ID,
      level: 1,
      imageUrl: "/mock-categories/hair-care.jpg",
      productCount: 18,
      path: ["Beauty", "Hair Care"],
    },
    children: [],
  },
  {
    category: {
      id: "wigs",
      slug: "wigs",
      name: "Wigs",
      parentId: ROOT_BEAUTY_ID,
      level: 1,
      imageUrl: "/mock-categories/wigs.jpg",
      productCount: 12,
      path: ["Beauty", "Wigs"],
      deals: ["deal-festival-flash"],
    },
    children: [],
  },
];

const FESTIVAL_CHILDREN: CategoryNode[] = [
  {
    category: {
      id: "temporary-tattoos",
      slug: "temporary-tattoos",
      name: "Temporary Tattoos",
      parentId: ROOT_FESTIVAL_ID,
      level: 1,
      imageUrl: "/mock-categories/temporary-tattoos.jpg",
      productCount: 9,
      path: ["Festival", "Temporary Tattoos"],
      deals: ["deal-festival-flash"],
    },
    children: [],
  },
];

export const MOCK_CREATOR_CATEGORY_TREE: CreatorCategoryTreeResponse = {
  creatorId: "nina-studio",
  roots: [
    {
      category: {
        id: ROOT_BEAUTY_ID,
        slug: "beauty",
        name: "Beauty",
        parentId: null,
        level: 0,
        productCount: 0,
        path: ["Beauty"],
        priority: 10,
      },
      children: BEAUTY_CHILDREN,
    },
    {
      category: {
        id: ROOT_FESTIVAL_ID,
        slug: "festival",
        name: "Festival",
        parentId: null,
        level: 0,
        productCount: 0,
        path: ["Festival"],
        priority: 8,
      },
      children: FESTIVAL_CHILDREN,
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

