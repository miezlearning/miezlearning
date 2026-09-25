require("dotenv").config();
const Mustache = require("mustache");
const fs = require("fs");
const { Octokit } = require("@octokit/rest");

const githubUsername = process.env.GH_USERNAME || "miezlearning";
const authToken = process.env.GH_ACCESS_TOKEN || process.env.GITHUB_TOKEN || undefined;

const octokit = new Octokit({
  auth: authToken,
  userAgent: "readme-updater/2.0.0",
  baseUrl: "https://api.github.com",
  log: {
    warn: console.warn,
    error: console.error,
  },
});

async function fetchRepositories(username) {
  let repos = [];
  let page = 1;

  while (true) {
    try {
      const response = await octokit.rest.repos.listForUser({
        username,
        per_page: 100,
        page,
      });

      if (!response.data || response.data.length === 0) break;
      repos = repos.concat(response.data);
      if (response.data.length < 100) break;
      page++;
    } catch (err) {
      console.error(`Error fetching repos page ${page}:`, err.message);
      break;
    }
  }

  return repos;
}

function calculateStars(repos) {
  return repos.reduce((sum, repo) => sum + (repo.stargazers_count || 0), 0);
}

async function fetchCommitCounts(username) {
  let totalCommits = 0;
  let totalCommitsInPastYear = 0;

  // 1. Fetch total commits across all public repositories on GitHub
  try {
    const totalResult = await octokit.rest.search.commits({
      q: `author:${username}`,
    });
    totalCommits = totalResult.data.total_count;
  } catch (err) {
    console.warn("Could not fetch total commits via search API:", err.message);
  }

  // 2. Fetch past year commits
  try {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const cutoffDateStr = oneYearAgo.toISOString().split("T")[0];

    const pastYearResult = await octokit.rest.search.commits({
      q: `author:${username} committer-date:>${cutoffDateStr}`,
    });
    totalCommitsInPastYear = pastYearResult.data.total_count;
  } catch (err) {
    console.warn("Could not fetch past year commits via search API:", err.message);
  }

  return { totalCommits, totalCommitsInPastYear };
}

async function updateReadme(data) {
  const TEMPLATE_PATH = "./main.mustache";
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  const output = Mustache.render(template, data);
  fs.writeFileSync("README.md", output);
  console.log("README.md successfully updated!");
}

async function main() {
  console.log(`Gathering data for GitHub user: ${githubUsername}...`);

  const repos = await fetchRepositories(githubUsername);
  const totalStars = calculateStars(repos);
  const totalRepos = repos.length;

  const { totalCommits, totalCommitsInPastYear } = await fetchCommitCounts(githubUsername);

  console.log("Stats found:", {
    username: githubUsername,
    totalRepos,
    totalStars,
    totalCommits,
    totalCommitsInPastYear,
  });

  const templateData = {
    githubUsername,
    totalStars: totalStars.toLocaleString("en-US"),
    totalRepos: totalRepos.toLocaleString("en-US"),
    totalCommits: totalCommits.toLocaleString("en-US"),
    totalCommitsInPastYear: totalCommitsInPastYear.toLocaleString("en-US"),
  };

  await updateReadme(templateData);
}

main().catch((err) => {
  console.error("Fatal error running updater:", err);
  process.exit(1);
});
