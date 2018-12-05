/**
 * @fileoverview Tests for the auto-closer plugin.
 * @author Nicholas C. Zakas
 */

"use strict";

//-----------------------------------------------------------------------------
// Requirements
//-----------------------------------------------------------------------------

const { autoCloser } = require("../../../src/plugins/index");

const nock = require("nock");
const probot = require("probot");
const GitHubApi = require("@octokit/rest");

//-----------------------------------------------------------------------------
// Helpers
//-----------------------------------------------------------------------------

let githubNock = nock("https://api.github.com");

/**
 * Creates a Nock mock for applying issue labels.
 * @param {number} issueNum The issue number that should be labeled.
 * @returns {Nock} The Nock instance.
 */
function checkNockLabelRequest(issueNum) {
    return githubNock
        .post(`/repos/test/repo-test/issues/${issueNum}/labels`, {
            labels: ["auto closed"]
        })
        .reply(200);
}

/**
 * Creates a Nock mock for closing issues.
 * @param {number} issueNum The issue number that should be closed.
 * @returns {Nock} The Nock instance.
 */
function checkNockClosedRequest(issueNum) {
    return githubNock
        .patch(`/repos/test/repo-test/issues/${issueNum}`, {
            state: "closed"
        })
        .reply(200);
}

/**
 * Creates a Nock mock for commenting on issues.
 * @param {number} issueNum The issue number that should be commented on.
 * @returns {Nock} The Nock instance.
 */
function checkNockCommentRequest(issueNum) {
    return githubNock
        .post(`/repos/test/repo-test/issues/${issueNum}/comments`, {
            body: /days/
        })
        .reply(200);
}

/**
 * Triggers the schedule on which the bot runs.
 * @param {*} bot The bot to trigger a schedule on.
 * @returns {Promise} A promise to trigger the schedule.
 */
function triggerSchedule(bot) {
    return bot.receive({
        name: "schedule.repository",
        payload: {
            installation: {
                id: 1
            },
            pull_request: {
                number: 1
            },
            sender: {
                login: "user-a"
            },
            repository: {
                name: "repo-test",
                owner: {
                    login: "test"
                }
            }
        }
    });

}

//-----------------------------------------------------------------------------
// Tests
//-----------------------------------------------------------------------------

describe("auto-closer", () => {
    let bot;

    beforeEach(async() => {
        githubNock = nock("https://api.github.com");
        bot = new probot.Application({
            id: "test",
            cert: "test",
            cache: {
                wrap: () => Promise.resolve({ data: { token: "test" } })
            },
            app: () => "test"
        });

        const { paginate } = await bot.auth();

        bot.auth = () => Object.assign(new GitHubApi(), { paginate });

        nock.disableNetConnect();

        autoCloser(bot);
    });

    afterEach(() => {
        nock.cleanAll();
    });

    it("performs a search, and closes all returned issues", async() => {
        githubNock
            .get("/repos/test/repo-test/labels")
            .reply(200, [
                {
                    name: "auto closed"
                },
                {
                    name: "accepted"
                }
            ]);

        githubNock
            .get("/search/issues")
            .query(value => value.q.includes(" label:accepted"))
            .reply(200, {
                total_count: 2,
                incomplete_results: false,
                items: [
                    { number: 1 },
                    { number: 2 }
                ]
            }, {
            });

        nock("https://api.github.com")
            .get("/search/issues")
            .query(value => value.q.includes(" -label:accepted"))
            .reply(200, {
                total_count: 2,
                incomplete_results: false,
                items: [
                    { number: 3 },
                    { number: 4 }
                ]
            }, {
            });

        // check that labels are updated
        const issueNumbers = [1, 2, 3, 4];

        issueNumbers.map(issueNum => checkNockLabelRequest(issueNum));
        issueNumbers.map(issueNum => checkNockClosedRequest(issueNum));
        issueNumbers.map(issueNum => checkNockCommentRequest(issueNum));

        await triggerSchedule(bot);
        expect(githubNock.isDone()).toBe(true);
    });

    it("does not close any issues if the appropriate label does not exist", async() => {
        githubNock
            .get("/repos/test/repo-test/labels")
            .reply(200, [
                {
                    name: "foo"
                },
                {
                    name: "bar"
                }
            ]);

        await triggerSchedule(bot);
        expect(githubNock.isDone()).toBe(true);
    });
});
