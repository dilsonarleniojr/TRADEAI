import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const res = await fetch('http://localhost:3001/health', {
      next: { revalidate: 0 }
    });
    if (!res.ok) {
      return NextResponse.json({ status: 'error', message: 'Backend service offline' }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ status: 'error', message: 'Backend service unreachable' }, { status: 502 });
  }
}
