using Markdig;
using Markdig.Extensions.AutoIdentifiers;

namespace HmMarkdownSimpleServer
{
    internal static class MarkdownPipelineProvider
    {
        // 共通の MarkdownPipeline 構成を一箇所に集約（挙動は不変）
        public static MarkdownPipeline CreateDefault()
        {
            return new MarkdownPipelineBuilder()
                .UseAutoIdentifiers(AutoIdentifierOptions.GitHub)
                .UseAdvancedExtensions()
                .UseEmojiAndSmiley()
                .UsePragmaLines()
                .Build();
        }
    }
}
