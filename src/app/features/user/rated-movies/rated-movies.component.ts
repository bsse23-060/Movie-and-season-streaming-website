import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { PosterUrlPipe } from '../../../shared/pipes/poster-url.pipe';
import { StorageService } from '../../../core/services/storage.service';
import { TMDBService } from '../../../core/services/tmdb.service';
import { Movie } from '../../../core/models/movie.model';

@Component({
  selector: 'app-rated-movies',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, PosterUrlPipe],
  templateUrl: './rated-movies.component.html',
  styleUrls: ['./rated-movies.component.css']
})
export class RatedMoviesComponent implements OnInit {
  ratedMovies: { movie: Movie, rating: number }[] = [];
  ratings: { [key: number]: number } = {};
  searchQuery = '';
  searchResults: Movie[] = [];
  searchLoading = false;
  selectedMovie: Movie | null = null;
  feedbackMessage = '';
  readonly stars = [1, 2, 3, 4, 5];

  constructor(
    private storage: StorageService,
    private tmdb: TMDBService,
    private router: Router
  ) {}

  ngOnInit() {
    this.reloadRatedMovies();
  }

  reloadRatedMovies() {
    this.ratings = this.storage.get<{ [key: number]: number }>('ratings') || {};
    const ratedIds = Object.keys(this.ratings).map(id => +id).filter(id => this.ratings[id] > 0);
    const movies: Movie[] = this.storage.getMoviesByIds(ratedIds);
    this.ratedMovies = movies
      .map((movie: Movie) => ({ movie, rating: this.ratings[movie.id] }))
      .sort((a, b) => this.getTitle(a.movie).localeCompare(this.getTitle(b.movie)));
    this.setBackdropImage();
  }

  setBackdropImage(): void {
    if (this.ratedMovies.length > 0) {
      const randomItem = this.ratedMovies[Math.floor(Math.random() * this.ratedMovies.length)];
      if (randomItem.movie.backdrop_path) {
        const backdropUrl = `https://image.tmdb.org/t/p/original${randomItem.movie.backdrop_path}`;
        document.documentElement.style.setProperty('--rated-backdrop-image', `url('${backdropUrl}')`);
      }
    }
  }

  searchMovies() {
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
          ? `${this.searchResults.length} title${this.searchResults.length === 1 ? '' : 's'} found. Select one and rate it.`
          : 'No matching movies or shows found.';
      },
      error: () => {
        this.searchLoading = false;
        this.searchResults = [];
        this.feedbackMessage = 'Search failed. Try another title.';
      }
    });
  }

  selectMovie(movie: Movie) {
    this.selectedMovie = movie;
    this.storage.saveMovie(movie);
    this.feedbackMessage = `${this.getTitle(movie)} selected. Choose a star rating.`;
  }

  rateMovie(movie: Movie, rating: number) {
    this.storage.setMovieRating(movie, rating);
    this.selectedMovie = movie;
    this.reloadRatedMovies();
    this.feedbackMessage = `${this.getTitle(movie)} is now rated ${rating}/5.`;
  }

  removeRating(movie: Movie) {
    this.storage.setMovieRating(movie, 0);
    this.reloadRatedMovies();
    this.feedbackMessage = `Removed your rating for ${this.getTitle(movie)}.`;

    if (this.selectedMovie?.id === movie.id) {
      this.selectedMovie = movie;
    }
  }

  getRating(movie: Movie): number {
    return this.ratings[movie.id] || 0;
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

  watchMedia(movie: Movie) {
    if (movie.media_type === 'tv' || movie.first_air_date) {
      this.router.navigate(['/watch', movie.id], { queryParams: { type: 'tv', season: 1, episode: 1 } });
    } else {
      this.router.navigate(['/watch', movie.id]);
    }
  }

  trackByMovie(_: number, item: { movie: Movie } | Movie): string {
    const movie = 'movie' in item ? item.movie : item;
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
