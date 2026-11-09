import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getView } from '@/lib/data/view';
import { editDraft } from '@/lib/data/actions';
import { PageHead } from '@/app/_components/ui';

export default async function EditDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { drafts } = await getView();
  const d = drafts().find((x) => x.id === id);
  if (!d) notFound();
  return (
    <>
      <p className="small"><Link href="/approvals">← Approvals</Link></p>
      <PageHead title="Edit draft" sub={<>{d.subject} · to {d.to}</>} />
      <form action={editDraft} className="card">
        <input type="hidden" name="draftId" value={d.id} />
        <label className="field">
          <span>Text</span>
          <textarea name="body" defaultValue={d.body} rows={18} dir={d.language === 'he' ? 'rtl' : undefined} />
        </label>
        <fieldset className="field" style={{ border: 0, padding: 0 }}>
          <span>What kind of change is this?</span>
          <label style={{ display: 'block' }}><input type="radio" name="kind" value="substantive" required /> Substantive: a fact, amount, date, legal point, recipient, promise or request changed</label>
          <label style={{ display: 'block' }}><input type="radio" name="kind" value="stylistic" /> Stylistic: wording or tone only</label>
        </fieldset>
        <label className="field">
          <span>Note (optional): what was wrong?</span>
          <input name="note" />
        </label>
        <div className="btns">
          <button className="btn primary">Save edit</button>
          <Link className="btn" href="/approvals">Cancel</Link>
        </div>
        <p className="why">The original is kept beside your edit, so the drafting learns from it. Any earlier approval lapses.</p>
      </form>
    </>
  );
}
