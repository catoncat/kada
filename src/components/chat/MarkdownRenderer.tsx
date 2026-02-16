import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

const IMAGE_LINE_RE =
  /^https?:\/\/\S+\.(png|jpe?g|gif|webp|avif|svg)(\?\S*)?$/i;

const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: [
      ...(defaultSchema.protocols?.href || []),
      'http',
      'https',
      'mailto',
      'tel',
    ],
    src: [...(defaultSchema.protocols?.src || []), 'http', 'https', 'data'],
  },
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a || []), 'target', 'rel'],
    img: [
      ...(defaultSchema.attributes?.img || []),
      'loading',
      'decoding',
      'width',
      'height',
    ],
    code: [...(defaultSchema.attributes?.code || []), 'className'],
  },
};

function normalizeMarkdownInput(input: string): string {
  return input
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (IMAGE_LINE_RE.test(trimmed)) {
        return `![](${trimmed})`;
      }
      return line;
    })
    .join('\n');
}

export function MarkdownRenderer({
  content,
  className,
  variant = 'assistant',
}: {
  content: string;
  className?: string;
  variant?: 'assistant' | 'user';
}) {
  const normalized = normalizeMarkdownInput(content);
  const isUser = variant === 'user';

  return (
    <div
      className={cn(
        'max-w-none break-words text-sm leading-6',
        '[&_h1]:mb-2 [&_h1]:font-semibold [&_h1]:text-xl',
        '[&_h2]:mb-2 [&_h2]:font-semibold [&_h2]:text-lg',
        '[&_h3]:mb-1.5 [&_h3]:font-semibold [&_h3]:text-base',
        '[&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-1',
        '[&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:italic',
        '[&_hr]:my-4 [&_hr]:border-border/60',
        '[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left',
        '[&_th]:border [&_th]:border-border/60 [&_th]:px-2 [&_th]:py-1 [&_th]:font-medium',
        '[&_td]:border [&_td]:border-border/60 [&_td]:px-2 [&_td]:py-1',
        '[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:px-3 [&_pre]:py-2',
        '[&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.92em]',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
        '[&_img]:my-3 [&_img]:max-h-[420px] [&_img]:max-w-full [&_img]:rounded-xl [&_img]:border [&_img]:object-contain',
        '[&_a]:underline [&_a]:underline-offset-4',
        isUser
          ? '[&_blockquote]:border-primary-foreground/40 [&_code]:bg-primary-foreground/15 [&_pre]:border-primary-foreground/25 [&_pre]:bg-primary-foreground/12 [&_a]:text-primary-foreground'
          : '[&_blockquote]:border-border [&_code]:bg-muted [&_pre]:bg-muted/45 [&_a]:text-primary',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        components={{
          a: ({ node: _node, href, ...props }) => (
            <a
              {...props}
              href={href}
              target="_blank"
              rel="noreferrer noopener"
            />
          ),
          img: ({ node: _node, src, alt, ...props }) => (
            <img
              {...props}
              src={src || ''}
              alt={alt || 'image'}
              loading="lazy"
              decoding="async"
            />
          ),
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
