import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { appsApi, type AppListing, type AppListingFilters, type Platform } from './api';

function ErrorMessage({ children }: { children: string }) {
  return <div className="research-alert" role="alert"><strong>{children}</strong></div>;
}

export function ExplorerWorkspace() {
  const [listings, setListings] = useState<AppListing[]>([]);
  const [filters, setFilters] = useState<AppListingFilters>({});
  const [draftFilters, setDraftFilters] = useState({ platform: '', geo: '', keyword: '' });
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const hasFilters = Boolean(filters.platform || filters.geo || filters.keyword);

  const load = useCallback(async (selectedFilters: AppListingFilters, nextCursor?: string) => {
    setLoading(true);
    setError('');
    try {
      const page = await appsApi.list(selectedFilters, nextCursor);
      setListings((current) => nextCursor ? [...current, ...page.items] : page.items);
      setCursor(page.next_cursor);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load app listings.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(filters); }, [filters, load]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextFilters: AppListingFilters = {
      platform: draftFilters.platform as Platform || undefined,
      geo: draftFilters.geo.trim().toUpperCase() || undefined,
      keyword: draftFilters.keyword.trim() || undefined,
    };
    setListings([]);
    setCursor(null);
    setFilters(nextFilters);
  }

  async function addListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true); setError(''); setSaved(false);
    try {
      await appsApi.create({
        platform: String(form.get('platform')) as Platform,
        store_app_id: String(form.get('store_app_id')),
        country: String(form.get('country')).trim().toUpperCase(),
        title: String(form.get('title')),
        developer: String(form.get('developer')),
        listing_url: String(form.get('listing_url') || '') || null,
      });
      formElement.reset();
      setSaved(true);
      setListings([]);
      setCursor(null);
      await load(filters);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to add store listing.');
    } finally { setSaving(false); }
  }

  return (
    <div className="explorer-workspace">
      <div className="source-safety-note">
        <strong>Store listings stay separate</strong>
        <span>Platform and country are shown for every record. Matching names are not grouped or treated as the same app. This workspace does not fetch store pages.</span>
      </div>

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {saved && <div className="research-success" role="status">Listing saved as user-provided metadata.</div>}

      <div className="explorer-columns">
        <section className="research-panel" aria-labelledby="listing-filter-title">
          <div className="panel-heading"><div><div className="eyebrow">FIND A STORE RECORD</div><h2 id="listing-filter-title">Filter listings</h2></div></div>
          <form className="research-form explorer-filter-form" onSubmit={applyFilters}>
            <label><span className="field-label">Platform</span><select value={draftFilters.platform} onChange={(event) => setDraftFilters((current) => ({ ...current, platform: event.target.value }))}><option value="">All platforms</option><option value="ios">iOS</option><option value="android">Android</option></select></label>
            <label><span className="field-label">Country / GEO</span><input value={draftFilters.geo} onChange={(event) => setDraftFilters((current) => ({ ...current, geo: event.target.value }))} maxLength={2} placeholder="US" aria-describedby="geo-help" /><small id="geo-help" className="field-help">Two-letter country code, such as US or JP.</small></label>
            <label><span className="field-label">Search</span><input value={draftFilters.keyword} onChange={(event) => setDraftFilters((current) => ({ ...current, keyword: event.target.value }))} maxLength={200} placeholder="Title, developer, or store ID" /></label>
            <button className="primary-action" type="submit">Apply filters</button>
          </form>
        </section>

        <section className="research-panel" aria-labelledby="add-listing-title">
          <div className="panel-heading"><div><div className="eyebrow">USER-PROVIDED METADATA</div><h2 id="add-listing-title">Add a store listing</h2></div></div>
          <form className="research-form explorer-add-form" onSubmit={addListing}>
            <div className="field-grid">
              <label><span className="field-label">Platform</span><select name="platform" defaultValue="ios"><option value="ios">iOS</option><option value="android">Android</option></select></label>
              <label><span className="field-label">Country / GEO</span><input name="country" required minLength={2} maxLength={2} pattern="[A-Za-z]{2}" placeholder="US" title="Enter a two-letter country code." /></label>
            </div>
            <label><span className="field-label">Store app ID</span><input name="store_app_id" required maxLength={255} placeholder="Numeric Apple ID or Android package" /></label>
            <label><span className="field-label">App title</span><input name="title" required maxLength={300} /></label>
            <label><span className="field-label">Developer / publisher</span><input name="developer" required maxLength={200} /></label>
            <label><span className="field-label">Listing URL <span>Optional</span></span><input name="listing_url" type="url" maxLength={2048} placeholder="https://…" /></label>
            <button className="primary-action" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add listing'}</button>
            <small className="field-help">Saving a URL stores the reference only. It does not open or scrape the page.</small>
          </form>
        </section>
      </div>

      <section className="research-panel explorer-results" aria-labelledby="explorer-results-title" aria-live="polite">
        <div className="panel-heading"><div><div className="eyebrow">APP EXPLORER</div><h2 id="explorer-results-title">Store listings <span className="results-count">{listings.length} loaded</span></h2></div></div>
        {loading && listings.length === 0 ? <p className="state-message">Loading listings…</p>
          : listings.length === 0 ? <div className="research-empty"><span aria-hidden="true">▦</span><strong>{hasFilters ? 'No listings match these filters' : 'No store listings registered'}</strong><p>{hasFilters ? 'Change the filters or add a listing that matches them.' : 'Add user-provided listing metadata to begin. No sample market data is included.'}</p></div>
            : <div className="app-listing-grid">{listings.map((listing) => (
              <article className="app-listing-card" key={listing.id}>
                <div className="app-listing-heading"><span className={`platform-chip platform-${listing.platform}`}>{listing.platform === 'ios' ? 'iOS' : 'Android'}</span><span className="geo-chip">{listing.country}</span></div>
                <h3>{listing.title}</h3>
                <p>{listing.developer}</p>
                <dl><div><dt>Store ID</dt><dd>{listing.store_app_id}</dd></div></dl>
                {listing.listing_url && <a href={listing.listing_url} target="_blank" rel="noreferrer">Open user-supplied listing ↗</a>}
              </article>
            ))}</div>}
        {cursor && <div className="explorer-load-more"><button type="button" className="secondary-action" disabled={loading} onClick={() => void load(filters, cursor)}>{loading ? 'Loading…' : 'Load more listings'}</button></div>}
        {!cursor && listings.length > 0 && <p className="state-message explorer-end">All matching listings are shown.</p>}
      </section>
    </div>
  );
}
