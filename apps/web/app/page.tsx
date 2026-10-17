import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-24">
      <h1 className="text-3xl font-semibold">Tokenwise</h1>
      <p className="text-neutral-600">Streaming AI chat with token metering and plan quotas.</p>
      <Link href="/login" className="w-fit rounded bg-neutral-900 px-4 py-2 text-white">
        Sign in
      </Link>
    </main>
  );
}
