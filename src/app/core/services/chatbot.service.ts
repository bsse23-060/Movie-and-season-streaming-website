import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TMDBService } from './tmdb.service';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface MovieRecommendation {
  id: number;
  title: string;
  overview: string;
  poster_path: string;
  vote_average: number;
  release_date: string;
}

interface TmdbMediaItem {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
  media_type?: string;
  popularity?: number;
  known_for_department?: string;
  biography?: string;
  birthday?: string;
  place_of_birth?: string;
  runtime?: number;
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  status?: string;
  tagline?: string;
  genres?: Array<{ id: number; name: string }>;
  credits?: {
    cast?: TmdbMediaItem[];
    crew?: TmdbMediaItem[];
  };
  combined_credits?: {
    cast?: TmdbMediaItem[];
    crew?: TmdbMediaItem[];
  };
}

interface WorkerChatResponse {
  response?: string;
}

@Injectable({ providedIn: 'root' })
export class ChatbotService {
  private http = inject(HttpClient);
  private tmdb = inject(TMDBService);

  private conversationHistory: ChatMessage[] = [];

  private readonly auraBotSystemPrompt = [
    'You are AuraBot, PopAuraStream\'s witty streaming critic.',
    'Compare movies, series, shows, characters, and actors with clear verdicts, scorecards, and taste-aware recommendations.',
    'Write like a sharp human critic: conversational, specific, playful, and a little cheeky.',
    'Use harmless jokes about the query or watchlist energy, but never bully the user, use slurs, or attack protected traits.',
    'Keep answers concise enough for a small chat window.'
  ].join(' ');

  private readonly movieGenreMap: Record<string, number> = {
    action: 28,
    adventure: 12,
    comedy: 35,
    funny: 35,
    drama: 18,
    horror: 27,
    scary: 27,
    thriller: 53,
    suspense: 53,
    romance: 10749,
    romantic: 10749,
    'sci-fi': 878,
    scifi: 878,
    science: 878,
    fantasy: 14,
    crime: 80,
    mystery: 9648,
    family: 10751,
    animation: 16
  };

  private readonly tvGenreMap: Record<string, number> = {
    action: 10759,
    adventure: 10759,
    comedy: 35,
    funny: 35,
    drama: 18,
    crime: 80,
    mystery: 9648,
    family: 10751,
    animation: 16,
    documentary: 99,
    reality: 10764,
    kids: 10762,
    'sci-fi': 10765,
    scifi: 10765,
    science: 10765,
    fantasy: 10765,
    war: 10768,
    political: 10768,
    western: 37
  };

  getConversationHistory(): ChatMessage[] {
    return [...this.conversationHistory];
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }

  sendMessage(userMessage: string): Observable<string> {
    const userChatMessage: ChatMessage = {
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    };
    this.conversationHistory.push(userChatMessage);

    return this.createResponse(userMessage).pipe(
      map(response => {
        this.addAssistantMessage(response);
        return response;
      }),
      catchError(error => {
        console.error('Chatbot error:', error);
        const fallbackResponse = this.getFallbackResponse(userMessage);
        this.addAssistantMessage(fallbackResponse);
        return of(fallbackResponse);
      })
    );
  }

  private createResponse(query: string): Observable<string> {
    const workerUrl = (environment.chatbotWorkerUrl ?? '').trim();

    if (workerUrl) {
      return this.createWorkerResponse(query, workerUrl).pipe(
        catchError(() => this.createLocalCriticResponse(query))
      );
    }

    return this.createLocalCriticResponse(query);
  }

  private createWorkerResponse(query: string, workerUrl: string): Observable<string> {
    const messages = this.conversationHistory.slice(-8).map(message => ({
      role: message.role,
      parts: [{ text: message.content }]
    }));

    return this.http.post<WorkerChatResponse>(workerUrl, {
      systemPrompt: this.auraBotSystemPrompt,
      messages
    }).pipe(
      map(response => response.response?.trim() || this.getFallbackResponse(query))
    );
  }

  private createLocalCriticResponse(query: string): Observable<string> {
    const lowerQuery = query.toLowerCase();
    const movieGenreId = this.findGenreId(lowerQuery, this.movieGenreMap);
    const tvGenreId = this.findGenreId(lowerQuery, this.tvGenreMap);

    if (this.isGreeting(lowerQuery)) {
      return of("Hello! I'm AuraBot, your movie and season critic. Name a movie, show, actor, character, or give me a messy little \"X vs Y\" debate and I'll judge it properly.");
    }

    if (lowerQuery.includes('help') || lowerQuery.includes('what can you')) {
      return of("I can help with:\n- **Movie and series recommendations** by genre, mood, or rating\n- **Head-to-head comparisons** like \"Breaking Bad vs Game of Thrones\"\n- **Actor and character searches** from TMDB results\n- **Critic-style verdicts** with a tiny harmless roast when your query deserves one\n\nTry: \"compare Inception and Interstellar\", \"suggest comedy seasons\", or \"Tom Cruise vs Keanu Reeves\".");
    }

    if (this.isComparisonRequest(lowerQuery)) {
      return this.createComparisonResponse(query);
    }

    if (lowerQuery.includes('anime')) {
      return this.tmdb.getPopularAnime().pipe(
        map((response: any) => this.formatRecommendations(response?.results, 'Here are anime picks with actual couch-gravity:')),
        catchError(() => of(this.getFallbackResponse(query)))
      );
    }

    if (this.wantsSeasonSuggestions(lowerQuery)) {
      if (lowerQuery.includes('top rated') || lowerQuery.includes('best rated')) {
        return this.tmdb.getTopRatedTv().pipe(
          map((response: any) => this.formatRecommendations(response?.results, 'Here are top-rated seasons and shows with critic approval:')),
          catchError(() => of(this.getFallbackResponse(query)))
        );
      }

      const tvRequest = tvGenreId
        ? this.tmdb.discoverTvByGenre(tvGenreId)
        : this.tmdb.getPopularTv();
      const intro = tvGenreId
        ? `Here are ${this.findGenreName(tvGenreId, this.tvGenreMap)} season and TV show picks worth binging:`
        : 'Here are binge-worthy seasons and TV shows right now:';

      return tvRequest.pipe(
        map((response: any) => this.formatRecommendations(response?.results, intro)),
        catchError(() => of(this.getFallbackResponse(query)))
      );
    }

    if (movieGenreId) {
      return this.tmdb.discoverMoviesByGenre(movieGenreId).pipe(
        map((response: any) => this.formatRecommendations(response?.results, `Here are ${this.findGenreName(movieGenreId, this.movieGenreMap)} movie picks with critic seasoning:`)),
        catchError(() => of(this.getFallbackResponse(query)))
      );
    }

    if (lowerQuery.includes('top rated') || lowerQuery.includes('best rated')) {
      return this.tmdb.getTopRatedMovies().pipe(
        map((response: any) => this.formatRecommendations(response?.results, 'Here are top-rated movies that earned their applause:')),
        catchError(() => of(this.getFallbackResponse(query)))
      );
    }

    if (lowerQuery.includes('popular') || lowerQuery.includes('trending') || lowerQuery.includes('this week')) {
      return this.tmdb.getPopularMovies().pipe(
        map((response: any) => this.formatRecommendations(response?.results, 'Here are popular movies right now, filtered through AuraBot taste court:')),
        catchError(() => of(this.getFallbackResponse(query)))
      );
    }

    if (lowerQuery.includes('recommend') || lowerQuery.includes('suggest') || lowerQuery.includes('watch tonight')) {
      return this.tmdb.getPopularMovies().pipe(
        map((response: any) => this.formatRecommendations(response?.results, 'Here are crowd-pleasing movie picks for tonight:')),
        catchError(() => of(this.getFallbackResponse(query)))
      );
    }

    const searchQuery = this.extractSearchQuery(query);
    if (searchQuery.length >= 2) {
      return this.tmdb.multiSearch(searchQuery).pipe(
        map((response: any) => this.formatSearchResponse(response?.results, searchQuery)),
        catchError(() => of(this.getFallbackResponse(query)))
      );
    }

    return of(this.getFallbackResponse(query));
  }

  private createComparisonResponse(query: string): Observable<string> {
    const terms = this.extractComparisonTerms(query);

    if (terms.length < 2) {
      return of('Give me two names to compare, like "Inception vs Interstellar" or "Tom Cruise vs Keanu Reeves". One title alone is not a fight, it is a monologue.');
    }

    const [firstTerm, secondTerm] = terms;

    return forkJoin([
      this.resolveComparisonItem(firstTerm),
      this.resolveComparisonItem(secondTerm)
    ]).pipe(
      map(([first, second]) => {
        if (!first || !second) {
          return `I tried to set up that face-off, but TMDB could not give me two clean matches for **${firstTerm}** and **${secondTerm}**. Try exact movie, show, or actor names.`;
        }

        return this.formatComparison(first, second, query);
      }),
      catchError(() => of(this.getFallbackResponse(query)))
    );
  }

  private resolveComparisonItem(term: string): Observable<TmdbMediaItem | null> {
    return this.tmdb.multiSearch(term).pipe(
      map((response: any) => this.pickBestResult(response?.results, term)),
      switchMap(item => item ? this.loadExpandedMedia(item) : of(null)),
      catchError(() => of(null))
    );
  }

  private loadExpandedMedia(item: TmdbMediaItem): Observable<TmdbMediaItem> {
    const mediaType = this.getMediaType(item);
    const fallback = { ...item, media_type: mediaType };

    if (mediaType === 'person') {
      return this.tmdb.getPersonDetails(item.id).pipe(
        map((details: any) => ({ ...fallback, ...details, media_type: 'person' })),
        catchError(() => of(fallback))
      );
    }

    if (mediaType === 'tv') {
      return this.tmdb.getTvDetails(item.id).pipe(
        map((details: any) => ({ ...fallback, ...details, media_type: 'tv' })),
        catchError(() => of(fallback))
      );
    }

    return this.tmdb.getMovieDetails(item.id).pipe(
      map((details: any) => ({ ...fallback, ...details, media_type: 'movie' })),
      catchError(() => of(fallback))
    );
  }

  private pickBestResult(results: TmdbMediaItem[] | undefined, term: string): TmdbMediaItem | null {
    const normalizedTerm = this.normalizeTitle(term);
    const candidates = (results ?? [])
      .filter(item => ['movie', 'tv', 'person'].includes(this.getMediaType(item)))
      .filter(item => !!this.getTitle(item));

    if (!candidates.length) {
      return null;
    }

    return candidates.sort((a, b) => {
      const aTitle = this.normalizeTitle(this.getTitle(a));
      const bTitle = this.normalizeTitle(this.getTitle(b));
      const aExact = aTitle === normalizedTerm ? 1000 : 0;
      const bExact = bTitle === normalizedTerm ? 1000 : 0;
      const aStarts = aTitle.startsWith(normalizedTerm) ? 200 : 0;
      const bStarts = bTitle.startsWith(normalizedTerm) ? 200 : 0;
      const aScore = aExact + aStarts + this.getComparableScore(a);
      const bScore = bExact + bStarts + this.getComparableScore(b);
      return bScore - aScore;
    })[0];
  }

  private addAssistantMessage(content: string): void {
    this.conversationHistory.push({
      role: 'assistant',
      content,
      timestamp: new Date()
    });
  }

  private getFallbackResponse(query: string): string {
    const lowerQuery = query.toLowerCase();

    if (this.isComparisonRequest(lowerQuery)) {
      return 'I can compare movies, series, actors, and many TMDB-searchable characters. Try exact names like "Inception vs Interstellar" or "Tom Cruise vs Keanu Reeves".';
    }

    if (lowerQuery.includes('recommend') || lowerQuery.includes('suggest')) {
      return 'I can absolutely help. Try "action movies", "comedy seasons", "popular anime", "top rated TV shows", or give me two titles to compare. Your watchlist deserves structure, finally.';
    }

    if (this.isGreeting(lowerQuery)) {
      return "Hello! I'm AuraBot, your movie and season critic. I can recommend, compare, and judge your watch choices with only mild theatrical judgment.";
    }

    if (lowerQuery.includes('help')) {
      return "I can help with:\n- **Recommendations** for movies, seasons, and anime\n- **Comparisons** between movies, shows, actors, or TMDB-searchable characters\n- **Details** about plots, ratings, casts, and filmographies\n\nAsk: \"compare Inception and Interstellar\" or \"suggest thriller shows\".";
    }

    return 'I am having trouble finding that right now. Try a movie title, TV show title, actor name, genre, or a comparison like "Movie A vs Movie B".';
  }

  private isGreeting(query: string): boolean {
    return ['hello', 'hi', 'hey', 'salam', 'assalam'].some(greeting => query.includes(greeting));
  }

  private wantsSeasonSuggestions(query: string): boolean {
    const hasSeasonWord = /\b(tv|series|seasons?|episodes?|sitcoms?|web\s+series)\b/.test(query);
    const hasShowWord = /\bshows?\b/.test(query) && !/\bshow\s+me\b/.test(query);
    return hasSeasonWord || hasShowWord;
  }

  private isComparisonRequest(query: string): boolean {
    const hasDirectVs = /\b(vs\.?|versus)\b/.test(query);
    const hasCompareWord = /\b(compare|comparison|better|best between|who wins|which wins|which is better|should i watch)\b/.test(query);
    const hasConnector = /\b(and|or|than)\b/.test(query);
    return hasDirectVs || (hasCompareWord && hasConnector);
  }

  private extractComparisonTerms(query: string): string[] {
    const normalized = query
      .replace(/\bversus\b/gi, ' vs ')
      .replace(/\bvs\.\b/gi, ' vs ')
      .replace(/\bbetter than\b/gi, ' vs ')
      .replace(/\bwho is better\b/gi, 'compare')
      .replace(/\bwho wins\b/gi, 'compare')
      .replace(/\bwhich wins\b/gi, 'compare')
      .replace(/\bwhich is better\b/gi, 'compare')
      .replace(/\bshould i watch\b/gi, 'compare')
      .replace(/\b(best between|compare|comparison|between|movie|movies|film|films|series|shows?|actors?|characters?|please|tell me|like a critic|as a critic|critic|who|is better)\b/gi, ' ')
      .replace(/[?!.]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return normalized
      .split(/\s+(?:vs|and|or|than)\s+/i)
      .map(term => term.trim())
      .filter(term => term.length >= 2)
      .slice(0, 2);
  }

  private findGenreId(query: string, genreMap: Record<string, number>): number | null {
    const genre = Object.keys(genreMap).find(name => query.includes(name));
    return genre ? genreMap[genre] : null;
  }

  private findGenreName(genreId: number, genreMap: Record<string, number>): string {
    const genre = Object.entries(genreMap).find(([, id]) => id === genreId);
    return genre?.[0] ?? 'movie';
  }

  private extractSearchQuery(query: string): string {
    return query
      .replace(/\b(tell me about|show me|what is|who is|find|search|movie|movies|film|films|season|seasons|series|tv|show|shows|details|recommend|suggest|please)\b/gi, ' ')
      .replace(/[?!.]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private formatSearchResponse(results: TmdbMediaItem[] | undefined, query: string): string {
    const validResults = this.filterResults(results, true).slice(0, 5);

    if (!validResults.length) {
      return `I could not find a strong match for "${query}". Try an exact movie, TV show, actor, or character name.`;
    }

    const lines = validResults.map((item, index) => this.formatSearchLine(item, index));
    return `I found these matches for "${query}":\n${lines.join('\n')}\n\nWant judgment? Ask me to compare two of them. I live for tidy little entertainment arguments.`;
  }

  private formatRecommendations(results: TmdbMediaItem[] | undefined, intro: string): string {
    const picks = this.filterResults(results).slice(0, 5);

    if (!picks.length) {
      return 'I could not find good matches right now. Try another genre, mood, or title.';
    }

    const lines = picks.map((item, index) => {
      const title = this.getTitle(item);
      const year = this.getYear(item);
      const rating = item.vote_average ? ` - ${item.vote_average.toFixed(1)}/10` : '';
      return `${index + 1}. **${title}**${year ? ` (${year})` : ''}${rating}: ${this.getCriticBlurb(item)}`;
    });

    return `${intro}\n${lines.join('\n')}\n\n${this.getPlayfulRoast()}`;
  }

  private formatComparison(first: TmdbMediaItem, second: TmdbMediaItem, query: string): string {
    const firstTitle = this.getTitle(first);
    const secondTitle = this.getTitle(second);
    const firstScore = this.getComparableScore(first);
    const secondScore = this.getComparableScore(second);
    const difference = Math.abs(firstScore - secondScore);
    const winner = firstScore >= secondScore ? first : second;
    const winnerTitle = this.getTitle(winner);
    const closeRace = difference < 0.35;
    const verdict = closeRace
      ? `It is close, but I would give the edge to **${winnerTitle}**. Tiny margin, big group-chat argument.`
      : `**${winnerTitle}** wins. Not by accident either; the numbers and overall pull are doing real work.`;

    return [
      `**AuraBot Critic Matchup:** **${firstTitle}** vs **${secondTitle}**`,
      `**Verdict:** ${verdict}`,
      `**Scorecard:** ${this.getScorecard(first)} | ${this.getScorecard(second)}`,
      `**Why ${firstTitle} works:** ${this.getComparisonStrength(first)}`,
      `**Why ${secondTitle} works:** ${this.getComparisonStrength(second)}`,
      `**Final take:** ${this.getFinalComparisonTake(first, second, winner)}`,
      `**Tiny roast:** ${this.getPlayfulRoast(query)}`
    ].join('\n');
  }

  private formatSearchLine(item: TmdbMediaItem, index: number): string {
    const title = this.getTitle(item);
    const mediaType = this.getTypeLabel(item);

    if (this.getMediaType(item) === 'person') {
      const department = item.known_for_department ? ` - ${item.known_for_department}` : '';
      return `${index + 1}. **${title}** (${mediaType}${department}): ${this.getPersonKnownFor(item)}`;
    }

    const year = this.getYear(item);
    const rating = item.vote_average ? ` - ${item.vote_average.toFixed(1)}/10` : '';
    return `${index + 1}. **${title}**${year ? ` (${year})` : ''} (${mediaType})${rating}: ${this.getCriticBlurb(item)}`;
  }

  private filterResults(results: TmdbMediaItem[] | undefined, allowPeople = false): TmdbMediaItem[] {
    return (results ?? []).filter(item => {
      const mediaType = this.getMediaType(item);
      return !!this.getTitle(item) && (allowPeople || mediaType !== 'person');
    });
  }

  private getTitle(item: TmdbMediaItem): string {
    return item.title ?? item.name ?? '';
  }

  private getYear(item: TmdbMediaItem): string {
    const date = item.release_date ?? item.first_air_date ?? item.birthday ?? '';
    return date ? date.slice(0, 4) : '';
  }

  private getMediaType(item: TmdbMediaItem): string {
    if (item.media_type) {
      return item.media_type;
    }

    if (item.known_for_department || item.biography || item.birthday) {
      return 'person';
    }

    return item.first_air_date || item.name ? 'tv' : 'movie';
  }

  private getTypeLabel(item: TmdbMediaItem): string {
    const mediaType = this.getMediaType(item);
    if (mediaType === 'tv') {
      return 'TV show';
    }
    if (mediaType === 'person') {
      return 'Person';
    }
    return 'Movie';
  }

  private getComparableScore(item: TmdbMediaItem): number {
    if (this.getMediaType(item) === 'person') {
      return Math.min(10, (item.popularity ?? 0) / 12);
    }

    const rating = item.vote_average ?? 0;
    const popularityBoost = Math.min(1.2, (item.popularity ?? 0) / 500);
    return rating + popularityBoost;
  }

  private getScorecard(item: TmdbMediaItem): string {
    const title = this.getTitle(item);
    const type = this.getTypeLabel(item);

    if (this.getMediaType(item) === 'person') {
      const department = item.known_for_department ? `, ${item.known_for_department}` : '';
      return `${title}: ${type}${department}, popularity ${Math.round(item.popularity ?? 0)}`;
    }

    const rating = item.vote_average ? `${item.vote_average.toFixed(1)}/10` : 'no rating';
    const runtime = this.getRuntime(item);
    const seasons = item.number_of_seasons ? `, ${item.number_of_seasons} seasons` : '';
    return `${title}: ${type}, ${rating}${runtime}${seasons}`;
  }

  private getRuntime(item: TmdbMediaItem): string {
    if (item.runtime) {
      return `, ${item.runtime} min`;
    }

    const episodeRuntime = item.episode_run_time?.[0];
    return episodeRuntime ? `, ${episodeRuntime} min episodes` : '';
  }

  private getComparisonStrength(item: TmdbMediaItem): string {
    if (this.getMediaType(item) === 'person') {
      return `${this.getTitle(item)} has the stronger screen-presence case when you look at popularity and known-work range. ${this.getPersonKnownFor(item)}`;
    }

    const genreText = item.genres?.slice(0, 2).map(genre => genre.name).join(' / ');
    const genrePart = genreText ? `It sits in ${genreText}, ` : '';
    const overview = this.getShortOverview(item);
    return `${genrePart}${overview || 'it has enough audience pull to stay in the conversation.'}`;
  }

  private getFinalComparisonTake(first: TmdbMediaItem, second: TmdbMediaItem, winner: TmdbMediaItem): string {
    const firstType = this.getMediaType(first);
    const secondType = this.getMediaType(second);

    if (firstType === 'person' || secondType === 'person') {
      return `Pick **${this.getTitle(winner)}** if you want the stronger overall star-power argument. For pure taste, your mood still gets a vote, sadly.`;
    }

    if (firstType !== secondType) {
      return `Pick **${this.getTitle(winner)}** for the stronger overall case, but remember this is a cross-format fight. Comparing a movie to a series is already dramatic behavior.`;
    }

    return `Pick **${this.getTitle(winner)}** first. The other one can wait, unless your weekend has no plans and questionable sleep discipline.`;
  }

  private getCriticBlurb(item: TmdbMediaItem): string {
    const rating = item.vote_average ?? 0;
    const overview = this.getShortOverview(item);

    if (rating >= 8) {
      return `Premium choice. Strong rating, strong pull, and ${overview || 'enough reputation to justify clearing your evening.'}`;
    }

    if (rating >= 7) {
      return `Reliable pick. ${overview || 'It has enough polish to avoid becoming background noise.'}`;
    }

    if (rating > 0) {
      return `A gamble, but not a hopeless one. ${overview || 'Go in for vibes, not perfection.'}`;
    }

    return overview || 'Not much data yet, so this is a vibes-first recommendation.';
  }

  private getPersonKnownFor(item: TmdbMediaItem): string {
    const credits = item.combined_credits?.cast ?? item.credits?.cast ?? [];
    const knownFor = credits
      .filter(credit => this.getTitle(credit))
      .sort((a, b) => this.getComparableScore(b) - this.getComparableScore(a))
      .slice(0, 3)
      .map(credit => this.getTitle(credit));

    if (knownFor.length) {
      return `Known for ${knownFor.join(', ')}.`;
    }

    return item.biography ? this.getShortOverview(item) : 'TMDB has the name, but not enough juicy detail here.';
  }

  private getShortOverview(item: TmdbMediaItem): string {
    const overview = (item.overview ?? item.biography)?.trim();
    if (!overview) {
      return '';
    }

    const firstSentence = overview.split(/(?<=[.!?])\s+/)[0] ?? overview;
    return firstSentence.length > 150 ? `${firstSentence.slice(0, 147)}...` : firstSentence;
  }

  private getPlayfulRoast(seed = ''): string {
    const roasts = [
      'This query has strong "I opened five tabs and still asked the bot" energy. Respect.',
      'Your watchlist is about to develop standards. Terrifying progress.',
      'This is exactly the kind of question that starts a debate and ruins snack timing.',
      'A bold request. The algorithm adjusted its monocle.',
      'I will judge the content, not you. Mostly.'
    ];
    const index = Math.abs(seed.length || this.conversationHistory.length) % roasts.length;
    return roasts[index];
  }

  private normalizeTitle(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  searchMovieFromChat(title: string): Observable<MovieRecommendation[]> {
    return this.tmdb.searchMovies(title).pipe(
      map((response: any) => {
        return response.results?.slice(0, 5).map((movie: any) => ({
          id: movie.id,
          title: movie.title,
          overview: movie.overview,
          poster_path: movie.poster_path,
          vote_average: movie.vote_average,
          release_date: movie.release_date
        })) || [];
      }),
      catchError(() => of([]))
    );
  }
}
