import { NextRequest, NextResponse } from "next/server";

const baseUrl = process.env.MERCHANT_API_BASE_URL;
const adminKey = process.env.MERCHANT_ADMIN_KEY;

if (!baseUrl) {
  console.warn("[ops/promotions/:id] MERCHANT_API_BASE_URL is not set");
}
if (!adminKey) {
  console.warn("[ops/promotions/:id] MERCHANT_ADMIN_KEY is not set");
}

export async function GET(_: NextRequest, { params }: any) {
  if (!baseUrl || !adminKey) {
    return NextResponse.json({ error: "Merchant backend is not configured." }, { status: 500 });
  }

  try {
    const res = await fetch(`${baseUrl}/api/merchant/promotions/${params.id}`, {
      headers: {
        "X-ADMIN-KEY": adminKey,
      },
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("[ops/promotions/:id] GET error", error);
    return NextResponse.json({ error: "Failed to fetch promotion." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: any) {
  if (!baseUrl || !adminKey) {
    return NextResponse.json({ error: "Merchant backend is not configured." }, { status: 500 });
  }

  const body = await req.json();

  try {
    const res = await fetch(`${baseUrl}/api/merchant/promotions/${params.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-ADMIN-KEY": adminKey,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("[ops/promotions/:id] PATCH error", error);
    return NextResponse.json({ error: "Failed to update promotion." }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: any) {
  if (!baseUrl || !adminKey) {
    return NextResponse.json({ error: "Merchant backend is not configured." }, { status: 500 });
  }

  try {
    const res = await fetch(`${baseUrl}/api/merchant/promotions/${params.id}`, {
      method: "DELETE",
      headers: {
        "X-ADMIN-KEY": adminKey,
      },
    });
    if (res.status === 204) {
      return NextResponse.json({ success: true }, { status: 204 });
    }
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("[ops/promotions/:id] DELETE error", error);
    return NextResponse.json({ error: "Failed to delete promotion." }, { status: 500 });
  }
}
