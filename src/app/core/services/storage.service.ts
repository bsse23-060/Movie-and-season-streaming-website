import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  get<T>(key: string): T | null {
    if (!this.isBrowser) return null;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  }

  set(key: string, value: any): void {
    if (!this.isBrowser) return;
    if (value == null || value === undefined) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }

  remove(key: string): void {
    if (!this.isBrowser) return;
    localStorage.removeItem(key);
  }

  // --- List Management ---
  getLists(): any[] {
    return this.get<any[]>('lists') || [];
  }

  addList(list: any): any {
    const lists = this.getLists();
    const baseId = this.toListId(list?.id || list?.title || 'collection');
    const savedList = {
      ...list,
      id: this.getAvailableListId(baseId, lists),
      title: (list?.title || this.titleFromId(baseId)).trim(),
      movies: Array.from(new Set(Array.isArray(list?.movies) ? list.movies : [])),
      created: list?.created || new Date(),
      updated: new Date(),
      isPublic: Boolean(list?.isPublic),
      userId: list?.userId || 'me'
    };

    lists.push(savedList);
    this.set('lists', lists);
    return savedList;
  }

  deleteList(listId: string): void {
    let lists = this.getLists();
    lists = lists.filter(l => l.id !== listId);
    this.set('lists', lists);
  }

  getListById(listId: string): any | undefined {
    return this.getLists().find(l => l.id === listId);
  }

  // --- Movie Management ---
  getMovies(): any[] {
    return this.get<any[]>('movies') || [];
  }

  getMoviesByIds(ids: number[]): any[] {
    const movies = this.getMovies();
    return ids
      .map(id => movies.find(m => m.id === id))
      .filter(Boolean);
  }

  // --- User Management ---
  getCurrentUser(): any {
    let user = this.get<any>('currentUser');
    if (!user) {
      user = {
        id: 'me',
        name: 'User',
        email: '',
        favoriteMovieIds: [],
        lists: [],
        joined: new Date()
      };
      this.set('currentUser', user);
    }
    if (!user.favoriteMovieIds) {
      user.favoriteMovieIds = [];
      this.set('currentUser', user);
    }
    return user;
  }

  addMovieToFavorites(movie: any): void {
    const movieObj = typeof movie === 'number'
      ? this.getMovies().find((m: any) => m.id === movie)
      : movie;
    if (!movieObj || movieObj.id == null) return;

    const user = this.getCurrentUser();
    if (!user) return;
    if (!user.favoriteMovieIds.includes(movieObj.id)) {
      user.favoriteMovieIds.push(movieObj.id);
      this.set('currentUser', user);
    }
    this.saveMovie(movieObj);
  }

  removeMovieFromFavorites(movieId: number): void {
    const user = this.getCurrentUser();
    if (!user) return;
    user.favoriteMovieIds = user.favoriteMovieIds.filter((id: number) => id !== movieId);
    this.set('currentUser', user);
  }

  setMovieRating(movie: any, rating: number): void {
    if (!movie || movie.id == null) return;

    const ratings = this.get<{ [key: number]: number }>('ratings') || {};

    if (rating > 0) {
      ratings[movie.id] = rating;
      this.saveMovie(movie);
    } else {
      delete ratings[movie.id];
    }

    this.set('ratings', ratings);
  }

  addMovieToList(listId: string, movie: any): void {
    if (!movie || movie.id == null) return;

    const lists = this.getLists();
    let list = lists.find(l => l.id === listId);
    if (!list) {
      list = {
        id: listId,
        title: this.titleFromId(listId),
        movies: [],
        created: new Date(),
        updated: new Date(),
        isPublic: false,
        userId: 'me'
      };
      lists.push(list);
    }
    if (!Array.isArray(list.movies)) {
      list.movies = [];
    }
    if (!list.movies.includes(movie.id)) {
      list.movies.push(movie.id);
      list.updated = new Date();
      this.set('lists', lists);
    }
    this.saveMovie(movie);
  }

  ensureWatchedList(): any {
    let lists = this.getLists();
    let watched = lists.find(l => l.id === 'watched-movies');
    if (!watched) {
      watched = {
        id: 'watched-movies',
        title: 'Watched Movies',
        movies: [],
        created: new Date(),
        updated: new Date(),
        isPublic: false,
        userId: 'me'
      };
      lists.push(watched);
      this.set('lists', lists);
    }
    return watched;
  }

  removeMovieFromList(listId: string, movieId: number): void {
    const lists = this.getLists();
    const list = lists.find(l => l.id === listId);
    if (list) {
      list.movies = list.movies.filter((id: number) => id !== movieId);
      list.updated = new Date();
      this.set('lists', lists);
    }
  }

  saveMovie(movie: any): void {
    if (!movie || movie.id == null) return;

    const movies = this.getMovies();
    const index = movies.findIndex((m: any) => m.id === movie.id);
    if (index >= 0) {
      movies[index] = { ...movies[index], ...movie };
    } else {
      movies.push(movie);
    }
    this.set('movies', movies);
  }

  private toListId(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'collection';
  }

  private getAvailableListId(baseId: string, lists: any[]): string {
    let candidate = baseId;
    let suffix = 2;

    while (lists.some(list => list.id === candidate)) {
      candidate = `${baseId}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }

  private titleFromId(listId: string): string {
    return listId
      .replace(/-/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());
  }

}
