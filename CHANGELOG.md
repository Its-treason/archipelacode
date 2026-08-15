# Change Log

All notable changes to the "archipelacode" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Fixed

- The language picker no longer comes up empty for slots generated for Typescript
  or Golang. APWorld v0.0.2 and older only report `python3` and `javascript` in
  their slot data, so those slots looked like they had no language enabled at all.
  When the slot data reports no enabled language, the extension now offers the
  languages the slot data never mentioned instead of nothing.

### Added

- `archipelacode.languageOverride` setting, to pin the language your slot was
  generated for when the slot data doesn't report it.

## [0.0.1] - 2026-01-01

### Added

- All of the base logic.