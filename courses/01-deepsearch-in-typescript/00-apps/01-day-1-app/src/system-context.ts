type QueryResultSearchResult = {
    date: string;
    title: string;
    url: string;
    snippet: string;
};

type QueryResult = {
    query: string;
    results: QueryResultSearchResult[];
};

type ScrapeResult = {
    url: string;
    result: string;
};

export class SystemContext {
    /**
     * The current step in the loop
     */
    private _step = 0;

    /**
     * The initial user query
     */
    private userQuery: string = "";

    /**
     * The history of all queries searched
     */
    private queryHistory: QueryResult[] = [];

    /**
     * The history of all URLs scraped
     */
    private scrapeHistory: ScrapeResult[] = [];

    get step() {
        return this._step;
    }

    incrementStep() {
        this._step++;
    }

    shouldStop() {
        return this._step >= 10;
    }

    reportQueries(queries: QueryResult[]) {
        console.log(queries);
        this.queryHistory.push(...queries);
    }

    reportScrapes(scrapes: ScrapeResult[]) {
        this.scrapeHistory.push(...scrapes);
    }

    getQueryHistory(): string {
        return this.queryHistory
            .map((query) =>
                [
                    `## Query: "${query.query}"`,
                    ...query.results.map(this.toQueryResult),
                ].join("\n\n"),
            )
            .join("\n\n");
    }

    getScrapeHistory(): string {
        return this.scrapeHistory
            .map((scrape) =>
                [
                    `## Scrape: "${scrape.url}"`,
                    `<scrape_result>`,
                    scrape.result,
                    `</scrape_result>`,
                ].join("\n\n"),
            )
            .join("\n\n");
    }

    reportUserQuery(query: string) {
        this.userQuery = query;
    }

    getUserQuery(): string {
        return this.userQuery;
    }

    private toQueryResult = (
        query: QueryResultSearchResult,
    ) =>
        [
            `### ${query.date} - ${query.title}`,
            query.url,
            query.snippet,
        ].join("\n\n");
}
