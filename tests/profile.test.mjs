// Profile facts by role (shared/utils/profile.ts), audit #42 item 18: the doctor's curated view
// gets clinical facts only, never the owner's tracker settings.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROFILE_FIELDS, profileFieldsFor, profileNumber } from '../shared/utils/profile.ts'

const TRACKER_KEYS = ['water_goal_oz', 'cup_oz', 'protein_target_g']

test('the doctor sees clinical facts only; every tracker setting is withheld', () => {
  const keys = profileFieldsFor('doctor').map(f => f.key)
  assert.ok(keys.includes('blood_type'))
  for (const k of TRACKER_KEYS) assert.ok(!keys.includes(k), `${k} withheld from the doctor`)
  assert.ok(profileFieldsFor('doctor').every(f => !f.tracker))
})

test('owner, friend and demo see every field, in the declared order', () => {
  for (const role of ['owner', 'friend', 'demo']) {
    assert.deepEqual(profileFieldsFor(role).map(f => f.key), PROFILE_FIELDS.map(f => f.key), role)
  }
})

test('the tracker settings are exactly the water and food ones', () => {
  assert.deepEqual(PROFILE_FIELDS.filter(f => f.tracker).map(f => f.key), TRACKER_KEYS)
})

test('no role (signed out) reads like the doctor: nothing beyond clinical facts', () => {
  assert.deepEqual(profileFieldsFor(null).map(f => f.key), profileFieldsFor('doctor').map(f => f.key))
})

test('profileNumber: a stored string becomes a positive number, anything else the fallback', () => {
  assert.equal(profileNumber({ cup_oz: '12' }, 'cup_oz', 16), 12)
  assert.equal(profileNumber({ cup_oz: '' }, 'cup_oz', 16), 16)
  assert.equal(profileNumber({ cup_oz: 'abc' }, 'cup_oz', 16), 16)
  assert.equal(profileNumber({ cup_oz: '0' }, 'cup_oz', 16), 16)
  assert.equal(profileNumber(null, 'cup_oz', 16), 16)
})
