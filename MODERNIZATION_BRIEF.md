# Quiz Your Lizard Modernization Brief

## Current Direction

As of October 9, 2026, the first rewrite is a plain HTML/CSS/JavaScript app using
browser localStorage, in https://github.com/davidbreyer/quiz-your-lizard.
See `README.md` for the implemented features, storage limits, and tests.
The MAUI proposal below records the initial exploration and remains a possible
future native-app direction.

## Source

Old app cloned for analysis from:

- https://github.com/davidbreyer/QuizYourLizard.git
- Local copy: `old-source/`

The current workspace contains the new web prototype plus the read-only analysis clone. The original repository is excluded from the new repository.

## What The Old App Is

Quiz Your Lizard is a Xamarin.iOS / MonoTouch app, likely from the iOS 6/7 era.

Key technical traits:

- Single iOS project, not shared Xamarin.Forms.
- UI is built with `.xib` files and UIKit controllers.
- Separate iPhone and iPad layouts for major screens.
- Local SQLite database seeded from `quizlizard1.sqlite`.
- Localized strings for English and German.
- Registers `.qyl` quiz files and `quizlizard://` / `qyl://` URL schemes.
- Uses old `Mono.Data.Sqlite`, `MonoTouch.UIKit`, and `MonoTouch.Foundation`.

The app is small enough that a clean rewrite is more attractive than a mechanical migration.

## Core Product Model

The durable app model is:

- `Set`: a quiz/category.
- `Word`: a question/answer pair plus notes.
- `Word3`: optional custom wrong answers for multiple-choice mode.
- `Option`: persisted app settings.

Seed database contents:

- `US State Capitals`: 50 questions
- `German Numbers`: 101 questions
- `OSX Shell Commands`: 174 questions
- `World Capitals`: 196 questions
- Total seeded questions: 522

Tables in the seed database:

- `Set`
- `WordList`
- `Option`
- `Test1` legacy/junk
- `sqlite_sequence`

The seed database starts at `DBVersion = 1`. Runtime migrations add `Word3`, language columns, a German state capitals set, and newer options.

## User-Facing Features To Preserve

- Choose active category.
- Study mode:
  - Show question.
  - Reveal answer and notes.
  - Advance through a randomized list.
  - Optional reverse mode swaps question and answer.
- Pop Quiz mode:
  - Multiple-choice quiz.
  - Configurable question count, default 20.
  - Optional second chance.
  - Results split into first attempt, second attempt, and incorrect.
  - Uses custom wrong answers when present.
  - Otherwise generates wrong answers from same set, or nearby numbers for numeric answers.
- Spelling mode:
  - User types answer.
  - Incorrect keystrokes are rejected.
  - Auto-advances punctuation/spacing.
  - Hint button reveals progressive prefix.
  - Auto hint after repeated mistakes.
- Category/question editor:
  - Create, edit, delete categories.
  - Create, edit, delete questions.
  - Question, answer, notes, and up to 3 custom wrong answers.
- Import/export:
  - Export active set as `.qyl`.
  - Import `.qyl` into existing or new category.
  - `.qyl` format is XML text with root `<words>`.
- Localization:
  - English and German strings exist.

## Things Not To Port Directly

- `.xib` layouts and manual iPhone/iPad frame math.
- Static global app state and database singleton.
- `Thread.Sleep` calls around database operations.
- Old UIKit table delegates and view-controller nesting.
- Old email-compose-only sharing flow.
- Legacy app store / yellinglizard URLs.
- `Test1` table.
- Release/signing settings from the old `.csproj`.

## Known Migration Traps

- `EditQuestionScreen.StartScreen` calls `DeleteAllWord3ForWord` before reading existing wrong answers, so custom wrong answers may be lost in the old edit flow.
- `DeleteAllWord3ForWord` uses suspicious SQL: `DELETE [Word3] WHERE WordId = @WordId`. The correct SQLite form should be `DELETE FROM Word3 WHERE WordId = @WordId`.
- `DataAccess.ReadRandomWord` recursively calls itself when it rejects a word but does not return the recursive result.
- The app sometimes closes/disposes a static SQLite connection while other code can still request it.
- Runtime migrations mutate the bundled seed model, so the new app should define a clean current schema instead of reproducing all historical migration steps.
- `.qyl` import currently accepts raw XML text, despite older commented base64 code. A new importer should support raw XML and optionally tolerate legacy base64 if real files require it.

## Recommended Target

Create a new repository and build a fresh .NET MAUI app.

Suggested shape:

```text
QuizLizard/
  src/
    QuizLizard.App/              # .NET MAUI app
    QuizLizard.Core/             # domain models, quiz engine, import/export
    QuizLizard.Data/             # SQLite persistence
  tests/
    QuizLizard.Core.Tests/
    QuizLizard.Data.Tests/
  tools/
    import-old-seed/             # one-time seed extraction/conversion if needed
```

Recommended libraries:

- .NET 9 or current supported .NET MAUI baseline.
- CommunityToolkit.Mvvm for MVVM.
- SQLite-net-pcl or EF Core SQLite. SQLite-net-pcl is likely enough.
- xUnit/NUnit for core quiz-engine tests.

## Clean Schema Proposal

```sql
create table QuizSet (
  Id integer primary key autoincrement,
  Name text not null,
  QuestionLanguage text null,
  AnswerLanguage text null,
  CreatedAt text not null,
  UpdatedAt text not null
);

create table Card (
  Id integer primary key autoincrement,
  QuizSetId integer not null,
  Question text not null,
  Answer text not null,
  Notes text null,
  CreatedAt text not null,
  UpdatedAt text not null,
  foreign key (QuizSetId) references QuizSet(Id) on delete cascade
);

create table WrongAnswer (
  Id integer primary key autoincrement,
  CardId integer not null,
  Text text not null,
  ReverseText text null,
  SortOrder integer not null,
  foreign key (CardId) references Card(Id) on delete cascade
);

create table AppSetting (
  Key text primary key,
  Value text not null
);
```

## Rewrite Order

1. Build `QuizLizard.Core` first:
   - domain models
   - study-session engine
   - multiple-choice engine
   - spelling-session engine
   - `.qyl` import/export parser
2. Add tests for behavior copied from the old app:
   - reverse mode
   - second chance scoring
   - numeric wrong-answer generation
   - custom wrong answers
   - spelling auto-advance and hint behavior
   - `.qyl` round trips
3. Build SQLite repository and seed importer.
4. Build MAUI shell and pages:
   - category list/settings
   - study
   - pop quiz
   - spelling
   - editor
   - import/export/share
5. Add iOS-specific file association and URL scheme.
6. Add Android support only after the core iOS flow is stable, unless cross-platform launch is a goal from day one.

## Suggested First Milestone

The first valuable milestone is not a polished app. It is a runnable MAUI prototype with:

- Seed data imported.
- Category selector.
- Study mode.
- Pop Quiz mode.
- Core tests passing.

After that, add editor/import/export and spelling mode.
