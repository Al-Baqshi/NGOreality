import { useParams, Link } from 'react-router-dom';
import { useBlogPost } from '../../hooks/useSupabase';
import { Calendar, User, ArrowLeft } from 'lucide-react';
import SEO, { ArticleJsonLd, BreadcrumbJsonLd } from '../../components/SEO';
import { absoluteUrl } from '../../config/site';

export default function BlogDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { post, loading } = useBlogPost(slug);

  if (loading) {
    return <div className="text-center py-16 font-mono text-sm text-ink-400">Loading...</div>;
  }

  if (!post) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
        <Link to="/public/blog" className="inline-flex items-center gap-2 font-mono text-2xs uppercase tracking-wider text-ink-500 hover:text-ink-950 transition-colors mb-6">
          <ArrowLeft size={14} /> Back to Blog
        </Link>
        <div className="text-center py-16">
          <h2 className="text-2xl font-black uppercase tracking-tight mb-2">Post not found</h2>
          <p className="text-sm text-ink-400">The post you're looking for doesn't exist.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <SEO
        title={post.title}
        description={post.excerpt || post.title}
        path={`/public/blog/${post.slug}`}
        type="article"
        image={post.featured_image_url || undefined}
        publishedTime={post.published_at || undefined}
      />
      <ArticleJsonLd
        title={post.title}
        description={post.excerpt || post.title}
        url={absoluteUrl(`/public/blog/${post.slug}`)}
        publishedTime={post.published_at || new Date().toISOString()}
        author={post.author}
        image={post.featured_image_url || undefined}
      />
      <BreadcrumbJsonLd items={[
        { name: 'Home', path: '/public' },
        { name: 'Blog', path: '/public/blog' },
        { name: post.title, path: `/public/blog/${post.slug}` },
      ]} />
      <div>
        {/* Hero */}
        {post.featured_image_url && (
          <section className="border-b-3 border-ink-950 h-96 overflow-hidden">
            <img
              src={post.featured_image_url}
              alt={post.title}
              className="w-full h-full object-cover"
            />
          </section>
        )}

        {/* Article */}
        <section className="max-w-3xl mx-auto px-6 py-12 md:py-16">
          <Link to="/public/blog" className="inline-flex items-center gap-2 font-mono text-2xs uppercase tracking-wider text-ink-500 hover:text-ink-950 transition-colors mb-6">
            <ArrowLeft size={14} /> Back to Blog
          </Link>

          <article>
            <header className="mb-8 border-b-3 border-ink-950 pb-6">
              <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-4">
                {post.title}
              </h1>
              <div className="flex items-center gap-4 flex-wrap">
                {post.published_at && (
                  <div className="flex items-center gap-1.5 font-mono text-2xs text-ink-500 uppercase tracking-wider">
                    <Calendar size={14} />
                    {new Date(post.published_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </div>
                )}
                {post.author && (
                  <div className="flex items-center gap-1.5 font-mono text-2xs text-ink-500 uppercase tracking-wider">
                    <User size={14} />
                    {post.author}
                  </div>
                )}
              </div>
            </header>

            {post.excerpt && (
              <div className="mb-8 p-6 card-brutal">
                <p className="text-lg text-ink-700 leading-relaxed">{post.excerpt}</p>
              </div>
            )}

            <div className="prose prose-sm max-w-none text-ink-700 leading-relaxed">
              {post.content.split('\n').map((paragraph: string, i: number) => (
                paragraph.trim() && (
                  <p key={i} className="mb-4 text-sm leading-relaxed">
                    {paragraph}
                  </p>
                )
              ))}
            </div>
          </article>

          {/* Back to blog */}
          <div className="mt-12 border-t-3 border-ink-950 pt-8">
            <Link to="/public/blog" className="inline-flex items-center gap-2 font-mono text-2xs uppercase tracking-wider text-teal hover:text-teal transition-colors">
              <ArrowLeft size={14} /> Back to Blog
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
