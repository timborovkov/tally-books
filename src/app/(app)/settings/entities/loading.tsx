export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-muted h-8 w-48 animate-pulse rounded" />
      <div className="bg-muted h-4 w-72 animate-pulse rounded" />
      <div className="bg-muted mt-4 h-64 w-full animate-pulse rounded" />
    </div>
  );
}
