import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
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
}

@Injectable({ providedIn: 'root' })
export class ChatbotService {
  private tmdb = inject(TMDBService);

  private conversationHistory: ChatMessage[] = [];

  private readonly genreMap: Record<string, number> = {
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
    const lowerQuery = query.toLowerCase();

    if (this.isGreeting(lowerQuery)) {
      return of("Hello! I'm AuraBot, your movie companion. Tell me a genre, mood, actor, or title and I'll help you find something to watch.");
    }

    if (lowerQuery.includes('help') || lowerQuery.includes('what can you')) {
      return of("I can help with:\n- **Movie recommendations** by genre or mood\n- **Popular movies, TV shows, and anime**\n- **Movie lookups** for titles you mention\n- **What to watch tonight** suggestions\n\nTry asking: \"recommend action movies\", \"popular anime\", or \"tell me about Inception\".");
    }

    if (lowerQuery.includes('anime')) {
      return this.tmdb.getPopularAnime().pipe(
        map((response: any) => this.formatRecommendations(response?.results, 'Here are some anime picks worth checking out:')),
        catchError(() => of(this.getFallbackResponse(query)))
      );
    }

    if (lowerQuery.includes('tv') || lowerQuery.includes('show') || lowerQuery.includes('series')) {
      return this.tmdb.getPopularTv().pipe(
        map((response: any) => this.formatRecommendations(response?.results, 'Here are some popular TV shows right now:')),
        catchError(() => of(this.getFallbackResponse(query)))
      );
    }

    const genreId = this.findGenreId(lowerQuery);
    if (genreId) {
      return this.tmdb.discoverMoviesByGenre(genreId).pipe(
        map((response: any) => this.formatRecommendations(response?.results, `Here are some ${this.findGenreName(genreId)} picks:`)),
        catchError(() => of(this.getFallbackResponse(query)))
      );
    }

    if (lowerQuery.includes('top rated') || lowerQuery.includes('best rated')) {
      return this.tmdb.getTopRatedMovies().pipe(
        map((response: any) => this.formatRecommendations(response?.results, 'Here are some top-rated movies:')),
        catchError(() => of(this.getFallbackResponse(query)))
      );
    }

    if (lowerQuery.includes('popular') || lowerQuery.includes('trending') || lowerQuery.includes('this week')) {
      return this.tmdb.getPopularMovies().pipe(
        map((response: any) => this.formatRecommendations(response?.results, 'Here are some popular movies right now:')),
        catchError(() => of(this.getFallbackResponse(query)))
      );
    }

    if (lowerQuery.includes('recommend') || lowerQuery.includes('suggest') || lowerQuery.includes('watch tonight')) {
      return this.tmdb.getPopularMovies().pipe(
        map((response: any) => this.formatRecommendations(response?.results, 'Here are a few crowd-pleasing picks for tonight:')),
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

  private addAssistantMessage(content: string): void {
    this.conversationHistory.push({
      role: 'assistant',
      content,
      timestamp: new Date()
    });
  }

  private getFallbackResponse(query: string): string {
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.includes('recommend') || lowerQuery.includes('suggest')) {
      return "I'd love to help you find something great to watch! Try asking for a genre like \"action movies\", \"romantic comedies\", \"popular anime\", or \"top rated movies\".";
    }

    if (this.isGreeting(lowerQuery)) {
      return "Hello! I'm AuraBot, your movie companion. I can help you find movies, get info about actors, or suggest what to watch. What are you in the mood for today?";
    }

    if (lowerQuery.includes('help')) {
      return "I can help you with:\n- **Movie recommendations** - Tell me what genre or mood you're in\n- **Movie details** - Ask about any movie's plot, cast, or director\n- **Actor info** - Learn about your favorite actors\n- **What to watch** - Get suggestions based on your preferences\n\nJust ask away!";
    }

    return "I'm having trouble finding that right now. Try a movie title, TV show title, genre, or mood.";
  }

  private isGreeting(query: string): boolean {
    return ['hello', 'hi', 'hey', 'salam', 'assalam'].some(greeting => query.includes(greeting));
  }

  private findGenreId(query: string): number | null {
    const genre = Object.keys(this.genreMap).find(name => query.includes(name));
    return genre ? this.genreMap[genre] : null;
  }

  private findGenreName(genreId: number): string {
    const genre = Object.entries(this.genreMap).find(([, id]) => id === genreId);
    return genre?.[0] ?? 'movie';
  }

  private extractSearchQuery(query: string): string {
    return query
      .replace(/\b(tell me about|what is|who is|find|search|movie|film|details|recommend|suggest|please)\b/gi, ' ')
      .replace(/[?!.]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private formatSearchResponse(results: TmdbMediaItem[] | undefined, query: string): string {
    const validResults = this.filterResults(results);

    if (!validResults.length) {
      return `I couldn't find a strong match for "${query}". Try a movie title, TV show title, genre, or actor name.`;
    }

    return this.formatRecommendations(validResults, `I found these matches for "${query}":`);
  }

  private formatRecommendations(results: TmdbMediaItem[] | undefined, intro: string): string {
    const picks = this.filterResults(results).slice(0, 5);

    if (!picks.length) {
      return "I couldn't find good matches right now. Try another genre, mood, or title.";
    }

    const lines = picks.map((item, index) => {
      const title = this.getTitle(item);
      const year = this.getYear(item);
      const rating = item.vote_average ? ` - ${item.vote_average.toFixed(1)}/10` : '';
      const overview = this.getShortOverview(item);
      return `${index + 1}. **${title}**${year ? ` (${year})` : ''}${rating}${overview ? `: ${overview}` : ''}`;
    });

    return `${intro}\n${lines.join('\n')}`;
  }

  private filterResults(results: TmdbMediaItem[] | undefined): TmdbMediaItem[] {
    return (results ?? []).filter(item => {
      const mediaType = item.media_type ?? 'movie';
      return !!this.getTitle(item) && mediaType !== 'person';
    });
  }

  private getTitle(item: TmdbMediaItem): string {
    return item.title ?? item.name ?? '';
  }

  private getYear(item: TmdbMediaItem): string {
    const date = item.release_date ?? item.first_air_date ?? '';
    return date ? date.slice(0, 4) : '';
  }

  private getShortOverview(item: TmdbMediaItem): string {
    const overview = item.overview?.trim();
    if (!overview) {
      return '';
    }

    const firstSentence = overview.split(/(?<=[.!?])\s+/)[0] ?? overview;
    return firstSentence.length > 150 ? `${firstSentence.slice(0, 147)}...` : firstSentence;
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
