using Markdig;
using Markdig.Extensions.AutoIdentifiers;

namespace HmMarkdownSimpleServer
{
    internal static class MarkdownPipelineProvider
    {
        // ���ʂ� MarkdownPipeline �\������ӏ��ɏW��i�����͕s�ρj
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
