<?php

namespace App\Support;

use DOMDocument;
use DOMElement;
use DOMNode;

/**
 * Formatted content (proposals, contracts, templates) as Perfex keeps it: HTML from the
 * editor. Saving keeps only safe tags and attributes; showing turns old plain text into HTML.
 */
class RichText
{
    private const ALLOWED_TAGS = [
        'p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'sub', 'sup', 'small', 'big', 'font', 'center',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'hr', 'a', 'img',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col', 'figure', 'figcaption',
        'section', 'article', 'header', 'footer', 'dl', 'dt', 'dd', 'mark',
    ];

    /** Removed with everything inside them. */
    private const DROPPED_TAGS = ['script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'form', 'input', 'button', 'textarea', 'select', 'option', 'link', 'meta', 'base', 'svg', 'math', 'template', 'noscript', 'title', 'head'];

    private const ALLOWED_ATTRIBUTES = ['href', 'target', 'title', 'src', 'alt', 'width', 'height', 'style', 'colspan', 'rowspan', 'align', 'valign', 'border', 'cellpadding', 'cellspacing', 'color', 'size', 'face', 'start', 'type', 'span'];

    public static function looksLikeHtml(?string $content): bool
    {
        return (bool) preg_match('/<(p|br|div|span|strong|b|em|i|u|h[1-6]|ul|ol|li|table|a|img|blockquote|font|hr)\b[^>]*>/i', (string) $content);
    }

    /**
     * Clean HTML for saving. Plain text is kept as it is.
     */
    public static function clean(?string $content): ?string
    {
        if ($content === null || trim($content) === '' || ! self::looksLikeHtml($content)) {
            return $content;
        }

        $doc = new DOMDocument;
        $previous = libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="UTF-8"><div id="rich-root">'.$content.'</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        $root = $doc->getElementById('rich-root');
        if (! $root) {
            return strip_tags($content);
        }
        self::cleanChildren($root);

        $html = '';
        foreach ($root->childNodes as $child) {
            $html .= $doc->saveHTML($child);
        }

        return trim($html);
    }

    /**
     * Safe HTML to show: formatted content cleaned again, old plain text with its line breaks.
     */
    public static function toHtml(?string $content): string
    {
        if ($content === null || trim($content) === '') {
            return '';
        }

        return self::looksLikeHtml($content) ? (string) self::clean($content) : nl2br(e($content));
    }

    private static function cleanChildren(DOMNode $node): void
    {
        foreach (iterator_to_array($node->childNodes) as $child) {
            if ($child->nodeType === XML_COMMENT_NODE || $child->nodeType === XML_PI_NODE) {
                $node->removeChild($child);

                continue;
            }
            if (! $child instanceof DOMElement) {
                continue;
            }

            $tag = strtolower($child->tagName);
            if (in_array($tag, self::DROPPED_TAGS, true)) {
                $node->removeChild($child);

                continue;
            }

            self::cleanChildren($child);

            if (! in_array($tag, self::ALLOWED_TAGS, true)) {
                // Unknown tag: keep its text and children, drop the tag itself.
                while ($child->firstChild) {
                    $node->insertBefore($child->firstChild, $child);
                }
                $node->removeChild($child);

                continue;
            }

            self::cleanAttributes($child, $tag);
        }
    }

    private static function cleanAttributes(DOMElement $el, string $tag): void
    {
        foreach (iterator_to_array($el->attributes) as $attr) {
            $name = strtolower($attr->name);
            $value = trim($attr->value);
            $keep = in_array($name, self::ALLOWED_ATTRIBUTES, true) && ! str_starts_with($name, 'on');

            if ($keep && in_array($name, ['href', 'src'], true)) {
                $keep = (bool) preg_match('#^(https?:|mailto:|tel:|/|\#)#i', $value)
                    || ($name === 'src' && $tag === 'img' && preg_match('#^data:image/(png|jpe?g|gif|webp);base64,#i', $value));
            }
            if ($keep && $name === 'style') {
                $keep = ! preg_match('/expression|javascript:|vbscript:|url\s*\(|behavior|@import|-moz-binding/i', $value);
            }

            if (! $keep) {
                $el->removeAttribute($attr->name);
            }
        }

        if ($tag === 'a' && $el->getAttribute('target') !== '') {
            $el->setAttribute('target', '_blank');
            $el->setAttribute('rel', 'noopener noreferrer');
        }
    }
}
