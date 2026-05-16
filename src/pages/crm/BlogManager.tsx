import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { BlogPost } from '../../types';
import { FileText, Plus, Pencil, Trash2, Eye, EyeOff, Search, Calendar, User } from 'lucide-react';

export default function BlogManager() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchPosts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('blog_posts')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setPosts(data);
    setLoading(false);
  };

  useEffect(() => { fetchPosts(); }, []);

  const filtered = posts.filter((p) => {
    const matchesSearch = p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.slug.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !statusFilter || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const draftCount = posts.filter(p => p.status === 'draft').length;
  const publishedCount = posts.filter(p => p.status === 'published').length;

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this post?')) return;
    await supabase.from('blog_posts').delete().eq('id', id);
    fetchPosts();
  };

  const handleTogglePublish = async (post: BlogPost) => {
    const newStatus = post.status === 'published' ? 'draft' : 'published';
    const updates: Record<string, unknown> = { status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === 'published' && !post.published_at) {
      updates.published_at = new Date().toISOString();
    }
    await supabase.from('blog_posts').update(updates).eq('id', post.id);
    fetchPosts();
  };

  const handleSave = async (post: Partial<BlogPost>) => {
    setSaving(true);
    if (post.id) {
      await supabase.from('blog_posts').update({
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        content: post.content,
        featured_image_url: post.featured_image_url,
        author: post.author,
        status: post.status,
        updated_at: new Date().toISOString(),
      }).eq('id', post.id);
    } else {
      await supabase.from('blog_posts').insert({
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt || '',
        content: post.content || '',
        featured_image_url: post.featured_image_url || '',
        author: post.author || '',
        status: post.status || 'draft',
      });
    }
    setSaving(false);
    setEditing(null);
    setCreating(false);
    fetchPosts();
  };

  // Editor view
  if (editing || creating) {
    return (
      <BlogEditor
        post={editing}
        saving={saving}
        onSave={handleSave}
        onCancel={() => { setEditing(null); setCreating(false); }}
      />
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight">Blog Manager</h1>
          <p className="text-sm text-ink-500 mt-1">Create and manage blog posts for the public site.</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-brutal-accent inline-flex items-center gap-2">
          <Plus size={16} /> New Post
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card-brutal p-4">
          <div className="text-2xl font-black">{posts.length}</div>
          <div className="font-mono text-2xs uppercase tracking-wider text-ink-400">Total Posts</div>
        </div>
        <div className="card-brutal p-4">
          <div className="text-2xl font-black text-teal">{publishedCount}</div>
          <div className="font-mono text-2xs uppercase tracking-wider text-ink-400">Published</div>
        </div>
        <div className="card-brutal p-4">
          <div className="text-2xl font-black text-amber-600">{draftCount}</div>
          <div className="font-mono text-2xs uppercase tracking-wider text-ink-400">Drafts</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Search posts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-brutal w-full pl-10"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-brutal">
          <option value="">All Statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
      </div>

      {/* Post list */}
      {loading ? (
        <div className="text-center py-16 font-mono text-sm text-ink-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <FileText size={48} className="text-ink-200 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-ink-700 mb-2">No posts found</h3>
          <p className="text-sm text-ink-400">Create your first blog post to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((post) => (
            <div key={post.id} className="card-brutal p-4 flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center border-2 border-ink-200 bg-ink-50 shrink-0">
                <FileText size={18} className="text-ink-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-bold truncate">{post.title}</h3>
                  <span className={`shrink-0 font-mono text-2xs uppercase tracking-wider px-1.5 py-0.5 border ${
                    post.status === 'published'
                      ? 'border-teal text-teal bg-teal-light'
                      : 'border-amber-400 text-amber-600 bg-amber-50'
                  }`}>
                    {post.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 font-mono text-2xs text-ink-400 uppercase tracking-wider">
                  <span>/{post.slug}</span>
                  {post.author && (
                    <span className="flex items-center gap-1"><User size={10} /> {post.author}</span>
                  )}
                  {post.published_at && (
                    <span className="flex items-center gap-1"><Calendar size={10} /> {new Date(post.published_at).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleTogglePublish(post)}
                  title={post.status === 'published' ? 'Unpublish' : 'Publish'}
                  className="h-8 w-8 flex items-center justify-center border-2 border-ink-200 hover:border-ink-950 transition-colors"
                >
                  {post.status === 'published' ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  onClick={() => setEditing(post)}
                  title="Edit"
                  className="h-8 w-8 flex items-center justify-center border-2 border-ink-200 hover:border-ink-950 transition-colors"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(post.id)}
                  title="Delete"
                  className="h-8 w-8 flex items-center justify-center border-2 border-red-200 text-red-400 hover:border-red-600 hover:text-red-600 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Blog Editor ---

function BlogEditor({ post, saving, onSave, onCancel }: {
  post: BlogPost | null;
  saving: boolean;
  onSave: (post: Partial<BlogPost>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    title: post?.title || '',
    slug: post?.slug || '',
    excerpt: post?.excerpt || '',
    content: post?.content || '',
    featured_image_url: post?.featured_image_url || '',
    author: post?.author || '',
    status: post?.status || 'draft',
  });

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight">
            {post ? 'Edit Post' : 'New Post'}
          </h1>
          <p className="text-sm text-ink-500 mt-1">
            {post ? `Editing: ${post.title}` : 'Create a new blog post.'}
          </p>
        </div>
        <button onClick={onCancel} className="btn-brutal inline-flex items-center gap-2">
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-4">
          <div>
            <label className="label-brutal">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => {
                const title = e.target.value;
                setForm(f => ({ ...f, title, slug: f.slug || generateSlug(title) }));
              }}
              className="input-brutal w-full text-lg font-bold"
              placeholder="Enter post title..."
            />
          </div>

          <div>
            <label className="label-brutal">Slug</label>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => setForm(f => ({ ...f, slug: e.target.value }))}
              className="input-brutal w-full font-mono text-sm"
              placeholder="url-friendly-slug"
            />
          </div>

          <div>
            <label className="label-brutal">Excerpt</label>
            <textarea
              value={form.excerpt}
              onChange={(e) => setForm(f => ({ ...f, excerpt: e.target.value }))}
              className="input-brutal w-full h-24 text-sm"
              placeholder="Brief summary for post listings..."
            />
          </div>

          <div>
            <label className="label-brutal">Content</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))}
              className="input-brutal w-full h-96 text-sm leading-relaxed font-mono"
              placeholder="Write your post content here..."
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="card-brutal p-4 space-y-4">
            <h3 className="font-mono text-xs uppercase tracking-wider text-ink-400 border-b-2 border-ink-100 pb-2">Publishing</h3>

            <div>
              <label className="label-brutal">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm(f => ({ ...f, status: e.target.value as 'draft' | 'published' }))}
                className="input-brutal w-full"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>

            <div>
              <label className="label-brutal">Author</label>
              <input
                type="text"
                value={form.author}
                onChange={(e) => setForm(f => ({ ...f, author: e.target.value }))}
                className="input-brutal w-full"
                placeholder="Author name"
              />
            </div>

            <div>
              <label className="label-brutal">Featured Image URL</label>
              <input
                type="text"
                value={form.featured_image_url}
                onChange={(e) => setForm(f => ({ ...f, featured_image_url: e.target.value }))}
                className="input-brutal w-full font-mono text-xs"
                placeholder="https://..."
              />
            </div>

            {post?.published_at && (
              <div>
                <label className="label-brutal">Published</label>
                <div className="font-mono text-xs text-ink-500">
                  {new Date(post.published_at).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'long', day: 'numeric',
                  })}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => onSave({ ...form, id: post?.id })}
            disabled={saving || !form.title || !form.slug}
            className="btn-brutal-accent w-full inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? 'Saving...' : (post ? 'Update Post' : 'Create Post')}
          </button>
        </div>
      </div>
    </div>
  );
}
