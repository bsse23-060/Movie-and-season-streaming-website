import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MovieList } from '../../../core/models/list.model';
import { Movie } from '../../../core/models/movie.model';
import { StorageService } from '../../../core/services/storage.service';
import { TMDBService } from '../../../core/services/tmdb.service';

@Component({
  selector: 'app-list-detail',
  templateUrl: './list-detail.component.html',
  styleUrls: ['./list-detail.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule]
})
export class ListDetailComponent implements OnInit {
  listId: string = '';
  list?: MovieList;
  movies: Movie[] = [];
  searchQuery = '';
  searchResults: Movie[] = [];
  searchLoading = false;
  feedbackMessage = '';

  constructor(
    private storage: StorageService,
    private route: ActivatedRoute,
    private router: Router,
    private tmdb: TMDBService
  ) {}

  ngOnInit() {
    // Get listId from route parameters
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.listId = id;
        this.refresh();
      }
    });
  }

  refresh() {
    this.list = this.storage.getListById(this.listId);
    if (this.list) {
      this.list.movies = Array.isArray(this.list.movies) ? this.list.movies : [];
      this.movies = this.storage.getMoviesByIds(this.list.movies);
    } else {
      this.movies = [];
    }
  }


  getPosterUrl(posterPath: string | null): string {
    if (!posterPath) return 'https://via.placeholder.com/100x150';
    if (posterPath.startsWith('http')) return posterPath;
    return 'https://image.tmdb.org/t/p/w500' + posterPath;
  }

  searchCollection() {
    const query = this.searchQuery.trim();
    if (!query) return;

    this.searchLoading = true;
    this.feedbackMessage = '';

    this.tmdb.multiSearch(query).subscribe({
      next: (response: any) => {
        const seen = new Set<string>();
        this.searchResults = (response?.results || [])
          .filter((item: any) => item.media_type === 'movie' || item.media_type === 'tv')
          .filter((item: any) => item.poster_path || item.backdrop_path)
          .map((item: any) => this.mapMediaResult(item))
          .filter((movie: Movie) => {
            const key = `${movie.media_type || 'movie'}-${movie.id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .slice(0, 12);

        this.searchLoading = false;
        this.feedbackMessage = this.searchResults.length
          ? `${this.searchResults.length} title${this.searchResults.length === 1 ? '' : 's'} found.`
          : 'No matching movies or shows found.';
      },
      error: () => {
        this.searchLoading = false;
        this.searchResults = [];
        this.feedbackMessage = 'Search failed. Try another title.';
      }
    });
  }

  addMovieToCollection(movie: Movie) {
    if (!this.list) return;
    this.storage.addMovieToList(this.list.id, movie);
    this.refresh();
    this.feedbackMessage = `${this.getTitle(movie)} added to ${this.list.title}.`;
  }

  addToFavorites(movie: Movie) {
    this.storage.addMovieToFavorites(movie);
    this.feedbackMessage = `${this.getTitle(movie)} added to favorites.`;
  }

  removeFromList(movieId: number) {
    if (this.list) {
      const movie = this.movies.find(item => item.id === movieId);
      this.storage.removeMovieFromList(this.list.id, movieId);
      this.refresh();
      this.feedbackMessage = `${movie ? this.getTitle(movie) : 'Title'} removed from ${this.list.title}.`;
    }
  }

  isInList(movie: Movie): boolean {
    return Boolean(this.list?.movies?.includes(movie.id));
  }

  watchMedia(movie: Movie) {
    if (movie.media_type === 'tv' || movie.first_air_date) {
      this.router.navigate(['/watch', movie.id], { queryParams: { type: 'tv', season: 1, episode: 1 } });
    } else {
      this.router.navigate(['/watch', movie.id]);
    }
  }

  getTitle(movie: Movie): string {
    return movie.title || movie.name || '';
  }

  getReleaseDate(movie: Movie): string {
    return movie.release_date || movie.first_air_date || '';
  }

  getMediaLabel(movie: Movie): string {
    return movie.media_type === 'tv' || movie.first_air_date ? 'Series' : 'Movie';
  }

  trackByMovie(_: number, movie: Movie): string {
    return `${movie.media_type || 'movie'}-${movie.id}`;
  }

  private mapMediaResult(item: any): Movie {
    return {
      id: item.id,
      title: item.title ?? item.name,
      name: item.name,
      poster_path: item.poster_path ?? null,
      backdrop_path: item.backdrop_path ?? null,
      release_date: item.release_date ?? item.first_air_date ?? '',
      first_air_date: item.first_air_date,
      vote_average: item.vote_average ?? 0,
      overview: item.overview ?? '',
      media_type: item.media_type
    };
  }
}
