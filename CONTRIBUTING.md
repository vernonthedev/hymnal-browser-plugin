# Contributing to SDA Hymnal Lowerthirds Plugin

First off, thank you for considering contributing to this project! It's people like you that make this a great tool for the community. I welcome all contributions, whether it's fixing bugs, adding features, or improving documentation.

## How Can I Contribute?

### Reporting Bugs

If you find a bug, please [open an issue](https://github.com/vernonthedev/hymnal-browser-plugin/issues) and include:

- A clear and descriptive title.
- Steps to reproduce the bug.
- What you expected to see vs. what actually happened.

### Suggesting Enhancements

Feature requests are highly encouraged! Please open an issue and describe:

- The problem you're trying to solve.
- Your proposed solution or idea.

### Pull Requests

I love pull requests! If you want to contribute code:

1. Fork the repository.
2. Create a new branch for your feature or fix.
3. Make your changes.
4. Ensure your code follows the project's style.
5. Submit a pull request to the `main` branch.

## Development Setup

Please refer to the [README.md](README.md) for detailed instructions on setting up your local development environment.

Quick start:

1. Clone the repo.
2. Create a virtual environment: `py -3.12 -m venv env`
3. Activate it: `.\env\Scripts\activate`
4. Install dependencies: `pip install -r requirements.txt`
5. Run the server: `python server.py`

## Commit Message Guidelines

To keep the history clean and manageable, I follow the **[Conventional Commits](https://www.conventionalcommits.org/)** specification. This allows for automated versioning and the generation of a `CHANGELOG.md` file on every release.

### Format

`<type>(<scope>): <description>`

### Common Types

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `style`: Changes that do not affect the meaning of the code (formatting, missing semi-colons, etc.)
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools and libraries

### Example

`feat(hymns): add support for global search`
`fix(overlay): resolve text overflow issue on long titles`

## Code Quality & Standards

- **Python**: Follow [PEP 8](https://pep8.org/) where possible.
- **HTML/CSS**: Keep styles modular and try to use variables where appropriate.
- **Hymns Data**: If you are updating the `hymns/` directory, ensure the JSON format remains consistent so the parser doesn't break.

---

Thank you for your contributions! 💖
Made with love 💖 by @[vernonthedev](https://github.com/vernonthedev)
