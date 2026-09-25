/**
 * Row level security, exercised rather than read.
 *
 * Wrong RLS is a data breach and it cannot be verified by looking at it: a
 * policy that says `owner_id` and a policy that says `auth.uid()` look alike
 * and behave nothing alike. So two users are created, each does the things a
 * user does, and every answer is asserted.
 *
 *   npx supabase start
 *   node supabase/tests/rls.mjs
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/**
 * Where to point, and with what.
 *
 * Read from the running stack rather than written down. The local keys are the
 * same on every machine and are not secret, but a repository is not the place
 * for key-shaped strings — and hard-coding them means the suite silently tests
 * the wrong database the day somebody points it at a real one.
 */
function config() {
  const env = {
    url: process.env.SUPABASE_URL,
    anon: process.env.SUPABASE_ANON_KEY,
    service: process.env.SUPABASE_SERVICE_ROLE_KEY,
  }
  if (env.url && env.anon && env.service) return env

  try {
    const raw = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
      // fileURLToPath, not .pathname: a repo path with a space in it
      // percent-encodes, and the CLI then runs somewhere that does not exist.
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const s = JSON.parse(raw)
    return { url: s.API_URL, anon: s.ANON_KEY, service: s.SERVICE_ROLE_KEY }
  } catch {
    console.error('No stack to test against. Run `npm run db:start`, or set')
    console.error('SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.')
    process.exit(1)
  }
}

const { url: API, anon: ANON, service: SERVICE } = config()

let passed = 0
const failures = []
const check = (name, ok, detail) => {
  if (ok) { passed++; console.log(`  ok   ${name}`) }
  else { failures.push([name, detail]); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const rest = (token, path, init = {}) =>
  fetch(`${API}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: init.prefer ?? 'return=representation',
      ...(init.headers ?? {}),
    },
  })

async function makeUser(email) {
  const create = await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email, password: 'correct-horse-battery-staple', email_confirm: true,
      user_metadata: { full_name: email.split('@')[0] },
    }),
  })
  if (!create.ok) throw new Error(`could not create ${email}: ${await create.text()}`)
  const user = await create.json()

  const signIn = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct-horse-battery-staple' }),
  })
  if (!signIn.ok) throw new Error(`could not sign in ${email}: ${await signIn.text()}`)
  return { id: user.id, token: (await signIn.json()).access_token }
}

const doc = (name) => ({ name, document: { schemaVersion: 1, note: name }, schema_version: 1 })

/** Delete an account and, by cascade, everything it owned. */
async function removeUser(id) {
  await fetch(`${API}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  })
}

const run = async () => {
  const stamp = Date.now()
  const alice = await makeUser(`alice+${stamp}@example.test`)
  const bob = await makeUser(`bob+${stamp}@example.test`)
  // Left behind, these pile up in a database somebody is also using by hand.
  const cleanUp = () => Promise.all([removeUser(alice.id), removeUser(bob.id)])

  console.log('\nprofiles')
  const aProfile = await (await rest(alice.token, '/profiles?select=id,display_name')).json()
  check('a profile exists the moment the account does', aProfile.length === 1, JSON.stringify(aProfile))
  check('the profile is only ever your own', aProfile[0]?.id === alice.id)
  const bSeesA = await (await rest(bob.token, `/profiles?id=eq.${alice.id}`)).json()
  check('another account\'s profile is invisible', Array.isArray(bSeesA) && bSeesA.length === 0, JSON.stringify(bSeesA))

  console.log('\nprojects')
  const created = await (await rest(alice.token, '/projects', {
    method: 'POST', body: JSON.stringify({ ...doc('Alice one'), owner_id: alice.id }),
  })).json()
  check('a project can be created by its owner', Array.isArray(created) && created.length === 1, JSON.stringify(created))
  const projectId = created[0]?.id

  await rest(bob.token, '/projects', {
    method: 'POST', body: JSON.stringify({ ...doc('Bob one'), owner_id: bob.id }),
  })

  const aList = await (await rest(alice.token, '/projects?select=id,name')).json()
  check('the list is only your own projects', aList.length === 1 && aList[0].name === 'Alice one', JSON.stringify(aList))

  const bReadsA = await (await rest(bob.token, `/projects?id=eq.${projectId}`)).json()
  check('another account\'s project cannot be read', bReadsA.length === 0, JSON.stringify(bReadsA))

  const bWritesA = await rest(bob.token, `/projects?id=eq.${projectId}`, {
    method: 'PATCH', body: JSON.stringify({ name: 'Bob was here' }),
  })
  const bWrote = await bWritesA.json()
  check('another account\'s project cannot be written', Array.isArray(bWrote) && bWrote.length === 0, JSON.stringify(bWrote))

  const bDeletes = await rest(bob.token, `/projects?id=eq.${projectId}`, { method: 'DELETE' })
  const bDeleted = await bDeletes.json()
  check('another account\'s project cannot be deleted', Array.isArray(bDeleted) && bDeleted.length === 0, JSON.stringify(bDeleted))

  const stolen = await rest(bob.token, '/projects', {
    method: 'POST', body: JSON.stringify({ ...doc('forged'), owner_id: alice.id }),
  })
  check('a project cannot be created in someone else\'s name', stolen.status === 403 || stolen.status === 401, `status ${stolen.status}`)

  const junk = await rest(alice.token, '/projects', {
    method: 'POST', body: JSON.stringify({ name: 'junk', document: '"not an object"', owner_id: alice.id }),
  })
  check('a document that is not an object is refused', !junk.ok, `status ${junk.status}`)

  console.log('\noptimistic concurrency')
  const rev = created[0].revision
  const first = await (await rest(alice.token, `/projects?id=eq.${projectId}&revision=eq.${rev}`, {
    method: 'PATCH', body: JSON.stringify({ name: 'renamed', revision: rev + 1 }),
  })).json()
  check('a save that carries the revision it read succeeds', first.length === 1, JSON.stringify(first))
  const stale = await (await rest(alice.token, `/projects?id=eq.${projectId}&revision=eq.${rev}`, {
    method: 'PATCH', body: JSON.stringify({ name: 'clobbered', revision: rev + 1 }),
  })).json()
  check('a save carrying a stale revision changes nothing', stale.length === 0, JSON.stringify(stale))

  console.log('\nversions')
  const version = await rest(alice.token, '/project_versions', {
    method: 'POST',
    body: JSON.stringify({ project_id: projectId, document: { schemaVersion: 1 }, schema_version: 1, is_autosave: true }),
  })
  check('a version can be written through your own project', version.ok, `status ${version.status}`)
  const bVersion = await rest(bob.token, '/project_versions', {
    method: 'POST',
    body: JSON.stringify({ project_id: projectId, document: { schemaVersion: 1 }, schema_version: 1 }),
  })
  check('a version cannot be written through someone else\'s', !bVersion.ok, `status ${bVersion.status}`)

  console.log('\nplan limits')
  const limit = await (await rest(alice.token, '/rpc/may_i', {
    method: 'POST', body: JSON.stringify({ p_feature: 'projects', p_wanted: 2 }),
  })).json()
  check('the free plan allows a second project', limit === true, JSON.stringify(limit))
  const over = await (await rest(alice.token, '/rpc/may_i', {
    method: 'POST', body: JSON.stringify({ p_feature: 'projects', p_wanted: 9 }),
  })).json()
  check('the free plan does not allow a ninth', over === false, JSON.stringify(over))
  const unknown = await (await rest(alice.token, '/rpc/may_i', {
    method: 'POST', body: JSON.stringify({ p_feature: 'teleportation', p_wanted: 1 }),
  })).json()
  check('a feature no plan lists is denied, not allowed', unknown === false, JSON.stringify(unknown))

  // Alice has 1; the free plan allows 3, so the fourth is the one that fails.
  for (let i = 2; i <= 3; i++) {
    await rest(alice.token, '/projects', { method: 'POST', body: JSON.stringify({ ...doc(`Alice ${i}`), owner_id: alice.id }) })
  }
  const fourth = await rest(alice.token, '/projects', {
    method: 'POST', body: JSON.stringify({ ...doc('Alice 4'), owner_id: alice.id }),
  })
  check('the plan limit is enforced in the database, not the UI', !fourth.ok, `status ${fourth.status}`)

  const leak = await rest(alice.token, '/rpc/plan_for', {
    method: 'POST', body: JSON.stringify({ p_uid: bob.id }),
  })
  check('you cannot ask what somebody else is paying for', !leak.ok, `status ${leak.status}`)

  console.log('\nbilling is read-only')
  const forge = await rest(alice.token, '/subscriptions', {
    method: 'POST',
    body: JSON.stringify({ id: `sub_forged_${stamp}`, user_id: alice.id, status: 'active' }),
  })
  check('a subscription cannot be granted by its beneficiary', !forge.ok, `status ${forge.status}`)
  const forgePlan = await rest(alice.token, '/plans', {
    method: 'POST', body: JSON.stringify({ key: 'free-but-better', name: 'Nope', rank: 9 }),
  })
  check('plans cannot be invented by a user', !forgePlan.ok, `status ${forgePlan.status}`)
  const plans = await (await rest(alice.token, '/plans?select=key&order=rank')).json()
  check('plans are readable', Array.isArray(plans) && plans.length === 3, JSON.stringify(plans))

  console.log('\nanonymous')
  const anonRead = await rest(ANON, '/projects?select=id')
  const anonRows = await anonRead.json()
  check('a signed-out caller sees no projects', !Array.isArray(anonRows) || anonRows.length === 0, JSON.stringify(anonRows))

  await cleanUp()
  const gone = await (await rest(alice.token, '/projects?select=id')).json()
  check('deleting an account takes its projects with it',
    !Array.isArray(gone) || gone.length === 0, JSON.stringify(gone))

  console.log(`\n${passed} passed, ${failures.length} failed`)
  if (failures.length) {
    for (const [name, detail] of failures) console.log(`  ${name}\n    ${detail ?? ''}`)
    process.exit(1)
  }
}

run().catch((e) => { console.error(e); process.exit(1) })
