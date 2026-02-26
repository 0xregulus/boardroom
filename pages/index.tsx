import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Head from "next/head";

import { BoardroomFooter } from "../src/features/boardroom/components/BoardroomFooter";
import { BoardroomHeader } from "../src/features/boardroom/components/BoardroomHeader";
import { BoardroomStageContent } from "../src/features/boardroom/components/BoardroomStageContent";
import { useBoardroomHomeController } from "../src/features/boardroom/hooks/useBoardroomHomeController";
import { listLLMProviderOptions, type LLMProviderOption } from "../src/config/llm_providers";
import {
  listResearchProviderOptions,
  resolveConfiguredResearchProvider,
  type ResearchProvider,
  type ResearchProviderOption,
} from "../src/research/providers";

export {
  buildCreateDraftFromStrategy,
  deriveRiskAdjustedRoi,
  deriveRiskAdjustedValue,
  deriveRiskScore,
  deriveWeightedCapitalScore,
  parseSectionMatrix,
} from "../src/features/boardroom/utils";

interface HomePageProps {
  researchToolOptions: ResearchProviderOption[];
  defaultResearchProvider: ResearchProvider;
  llmProviderOptions: LLMProviderOption[];
}

export const getServerSideProps: GetServerSideProps<HomePageProps> = async () => {
  const researchToolOptions = listResearchProviderOptions(process.env);
  const llmProviderOptions = listLLMProviderOptions(process.env);

  return {
    props: {
      researchToolOptions,
      defaultResearchProvider: resolveConfiguredResearchProvider(process.env.BOARDROOM_RESEARCH_PROVIDER, process.env),
      llmProviderOptions,
    },
  };
};

export default function Home({
  researchToolOptions,
  defaultResearchProvider,
  llmProviderOptions,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { headerProps, stageContentProps, footerProps } = useBoardroomHomeController({
    researchToolOptions,
    defaultResearchProvider,
    llmProviderOptions,
  });

  return (
    <>
      <Head>
        <title>Boardroom</title>
        <meta name="description" content="Multi-Agent Workflow Engine" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </Head>

      <div className="boardroom-shell">
        <BoardroomHeader {...headerProps} />

        <section className="boardroom-main">
          <BoardroomStageContent {...stageContentProps} />
        </section>

        <BoardroomFooter {...footerProps} />
      </div>
    </>
  );
}
