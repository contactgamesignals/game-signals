export default function SettingsLoading() {
  return (
    <main className="app-shell route-loading" aria-live="polite" aria-busy="true">
      <div className="route-loading-card">
        <div className="route-loading-spinner" aria-hidden="true" />
        <strong>Loading settings...</strong>
        <span>Fetching workspace, billing and notification settings.</span>
      </div>
    </main>
  );
}
