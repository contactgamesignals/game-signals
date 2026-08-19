export default function DashboardLoading() {
  return (
    <main className="app-shell route-loading" aria-live="polite" aria-busy="true">
      <div className="route-loading-card">
        <div className="route-loading-spinner" aria-hidden="true" />
        <strong>Loading workspace...</strong>
        <span>Fetching your games and creator signals.</span>
      </div>
    </main>
  );
}
