/**
 * @fileoverview Creates a new issue with the "release" label if the old one is closed
 * @author Teddy Katz
 */

const moment = require("moment");

const LABEL_NAME = "release";

const ISSUE_TITLE_FORMAT = "[Scheduled release for ]MMMM Do, YYYY";

const getIssueBody = (releaseDate) => `

The scheduled release on ${releaseDate.format("dddd, MMMM Do, YYYY")} is assigned to:

* (needs volunteers)
* (needs volunteers)

Please use this issue to document how the release went, any problems during the release, and anything the team might want to know about the release process. This issue should be closed after all patch releases have been completed (or there was no patch release needed).

Resources:

* [Release guidelines](https://eslint.org/docs/maintainer-guide/releases)

`.trim();

async function issueWasClosedMultipleTimes(github, { owner, repo, number }) {
    const issueEvents = await github.issues.getEvents({
        owner,
        repo,
        issue_number: number,
        per_page: 100
    }).then((res) => res.data);

    return issueEvents.filter((eventObj) => eventObj.event === "closed").length > 1;
}

async function handleIssueClosed(context) {
    // If the issue does not have the "release" label, skip it.
    if (!context.payload.issue.labels.some((label) => label.name === LABEL_NAME)) {
        return;
    }

    // If the issue was previously closed and then reopened, skip it.
    if (await issueWasClosedMultipleTimes(context.github, context.issue())) {
        return;
    }

    const oldReleaseDate = moment.utc(context.payload.issue.title, ISSUE_TITLE_FORMAT, true);

    // If the issue title can't be parsed as a date, skip it.
    if (!oldReleaseDate.isValid()) {
        return;
    }

    const newReleaseDate = oldReleaseDate.clone().add({ weeks: 2 });

    const newIssueTitle = newReleaseDate.format(ISSUE_TITLE_FORMAT);
    const newIssueBody = getIssueBody(newReleaseDate);

    // Create a new issue with a date 2 weeks in the future.
    await context.github.issues.create(
        context.repo({
            title: newIssueTitle,
            body: newIssueBody,
            labels: [LABEL_NAME, "tsc agenda"]
        })
    );
}

module.exports = (robot) => {
    robot.on("issues.closed", handleIssueClosed);
};
