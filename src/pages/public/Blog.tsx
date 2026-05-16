import { useBlogPosts } from '../../hooks/useSupabase';
import { Link } from 'react-router-dom';
import { Calendar, User, ArrowRight, FileText } from 'lucide-react';
import SEO, { BreadcrumbJsonLd } from '../../components/SEO';

export default function Blog() {
  const { posts, loading } = useBlogPosts();

  return (
    <>
      <SEO
        title="Blog"
        description="Updates, insights, and announcements about nonprofit digital trust, transparency, and the NGOreality Reality Badge standard."
        path="/public/blog"
      />
      <BreadcrumbJsonLd items={[{ name: 'Home', path: '/public' }, { name: 'Blog', path: '/public/blog' }]} />
      <div>
        {/* Hero */}
        <section className="border-b-3 border-ink-950 bg-ink-950 text-white">
          <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px w-12 bg-accent" />
                <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-300">Latest Updates</span>
              </div>
              <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tight mb-4">
                NGOreality Blog
              </h1>
              <p className="text-ink-300 text-lg">
                Updates, insights, and announcements about nonprofit digital trust and transparency.
              </p>
            </div>
          </div>
        </section>

        {/* Posts */}
        <section className="max-w-7xl mx-auto px-6 py-16 md:py-24">
          {loading ? (
            <div className="text-center py-16 font-mono text-sm text-ink-400">Loading posts...</div>
          ) : posts.length === 0 ? (
            <div className="text-center py-16">
              <FileText size={48} className="text-ink-200 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-ink-700 mb-2">No posts yet</h3>
              <p className="text-sm text-ink-400">Check back soon for updates.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {posts.map((post) => (
                <Link key={post.id} to={`/public/blog/${post.slug}`} className="card-brutal-hover p-6 md:p-8 block">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                    {post.featured_image_url && (
                      <div className="md:col-span-1">
                        <img
                          src={post.featured_image_url}
                          alt={post.title}
                          className="w-full h-48 object-cover border-2 border-ink-950"
                        />
                      </div>
                    )}
                    <div className={post.featured_image_url ? 'md:col-span-2' : 'md:col-span-3'}>
                      <div className="flex items-center gap-3 mb-3 flex-wrap">
                        {post.published_at && (
                          <div className="flex items-center gap-1.5 font-mono text-2xs text-ink-400 uppercase tracking-wider">
                            <Calendar size={12} />
                            {new Date(post.published_at).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </div>
                        )}
                        {post.author && (
                          <div className="flex items-center gap-1.5 font-mono text-2xs text-ink-400 uppercase tracking-wider">
                            <User size={12} />
                            {post.author}
                          </div>
                        )}
                      </div>
                      <h2 className="text-2xl font-black uppercase tracking-tight mb-3">{post.title}</h2>
                      <p className="text-sm text-ink-600 leading-relaxed mb-4 line-clamp-3">
                        {post.excerpt}
                      </p>
                      <div className="flex items-center gap-2 font-mono text-2xs uppercase tracking-wider text-teal hover:text-teal">
                        Read More <ArrowRight size={12} />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
