import { describe, expect, it } from 'vitest'
// Saved from x.com/github on 2026-10-26, with synthetic handles, ids and text.
import loggedIn from '../fixtures/x-logged-in.html?raw'
import loggedOut from '../fixtures/x-logged-out.html?raw'
import { findProfile, findTweets, headerSlot, viewer } from './x-page'

function tweetsOn(page: string) {
  document.body.innerHTML = page
  return findTweets(document).map(({ id, author, article }) => ({
    id,
    author,
    tag: article.tagName,
  }))
}

const raj = (id: string) => ({ id, author: 'synthetic_raj', tag: 'ARTICLE' })

describe('findTweets', () => {
  it('reads every tweet on logged-in X, skipping photo and analytics links', () => {
    expect(tweetsOn(loggedIn)).toEqual([
      raj('1850000000000000001'),
      raj('1850000000000000002'),
      raj('1850000000000000003'),
      raj('1850000000000000004'),
      raj('1850000000000000005'),
      raj('1850000000000000006'),
    ])
  })

  it('reads every tweet on logged-out X, but not the tweet one of them quotes', () => {
    expect(tweetsOn(loggedOut)).toEqual([
      raj('1850000000000000001'),
      raj('1850000000000000002'),
      raj('1850000000000000003'),
      raj('1850000000000000004'),
      raj('1850000000000000005'),
    ])
  })
})

describe('headerSlot', () => {
  it("finds X's More button on each logged-in tweet, and none logged out", () => {
    document.body.innerHTML = loggedIn
    expect(findTweets(document).every(({ article }) => headerSlot(article))).toBe(true)
    document.body.innerHTML = loggedOut
    expect(findTweets(document).some(({ article }) => headerSlot(article))).toBe(false)
  })
})

describe('findProfile', () => {
  // X's profile header, cut down: name, bio and follow counts are siblings.
  const header = `
    <div id="header">
      <div data-testid="UserName"><div>
        <div><div style="display: flex; flex-direction: row"><div id="name"><span>Raj (synthetic)</span></div><div>badge</div></div></div>
        <div><div><span>@synthetic_raj</span></div></div>
      </div></div>
      <div data-testid="UserDescription">Synthetic bio</div>
      <div id="counts"><a href="/synthetic_raj/following">1 Following</a>
        <a href="/synthetic_raj/verified_followers">2 Followers</a></div>
    </div>`

  it('finds the name row and the follow counts on a profile and its tabs', () => {
    document.body.innerHTML = header
    for (const path of ['/synthetic_raj', '/synthetic_raj/', '/synthetic_raj/media']) {
      const profile = findProfile(document, path)
      expect(profile?.x).toBe('synthetic_raj')
      expect(profile?.name.id).toBe('name')
      expect(profile?.after.id).toBe('counts')
    }
  })

  it('finds nothing on a tweet, or where there is no profile header', () => {
    document.body.innerHTML = header
    expect(findProfile(document, '/synthetic_raj/status/1850000000000000001')).toBeUndefined()
    document.body.innerHTML = loggedIn
    expect(findProfile(document, '/home')).toBeUndefined()
  })
})

describe('viewer', () => {
  it("reads the signed-in handle from X's Profile link", () => {
    document.body.innerHTML =
      '<nav><a data-testid="AppTabBar_Profile_Link" href="/synthetic_raj">Profile</a></nav>'
    expect(viewer(document)).toBe('synthetic_raj')
  })

  it('is undefined on logged-out X', () => {
    document.body.innerHTML = loggedOut
    expect(viewer(document)).toBeUndefined()
  })
})
